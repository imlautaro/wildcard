import { privateTaskAccess } from '../tasks/access';
import { privateContact } from '../mcp/client';
import { generatedImage } from '../photos/generation';
import { contactModelAllowed } from './consent';
import { messageDelay, readingDelay, type ContactResponse } from './messages';
import { batchStatement, batchIntoNext, shouldHoldReply, waitForComposer } from './pacing';
import { runInitiative, type InitiativeJob } from './initiative';
import { jobAccountID, jobModel } from '../lib/model-preference';
import { maintainAgentMemories } from './agent-memory';
import { dispatchGroupRequests } from '../groups/request-results';
import { groupRequestTurnAllowed } from '../groups/request-access';
import { runGroup, type GroupJob } from '../groups/workflow';
import { scheduleAllowed } from '../schedules/data';
import type { VisitJob } from './visits';
import { expirePresence, markRead, markRecording, markTyping } from './presence';
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { enqueueReply, deliverPush } from '../push/delivery';
import { activeTurn, type AssistantMessage, type ChatJob } from './data';
import { safeErrorCode } from './meta';
import { contactReply } from './context';
import { maintainMemories } from './memory';
import { releaseAttention } from './dispatch';
import { storedAttachment } from './attachments';
import { TranscriptionFailure } from './transcription';
import { isVoice, privateVoiceReplies, speakMessage, transcribeVoice, voiceSuitable } from '../voice/speech';
import { NonRetryableError } from 'cloudflare:workflows';

// Checkpoint the remaining delay so replay takes the same branch. Memory work,
// generation and retries can consume the deadline before the pause is reached.
async function pauseUntil(step: WorkflowStep, name: string, deadline: number) {
  const remaining = await step.do(`${name}-remaining`, async () => Math.max(0, deadline - Date.now()));
  if (remaining > 0) await step.sleep(name, remaining);
}

// Null is an intentional reaction-only turn. Old checkpoints contain prose.
function replyMessages(reply: ContactResponse | string[] | string | null) {
  const response = reply && typeof reply === 'object' && !Array.isArray(reply) ? reply : null;
  const messages = response ? response.messages : typeof reply === 'string' ? [reply] : Array.isArray(reply) ? reply : [];
  // At most one message per reply is spoken: the first suitable one without an image.
  const spoken = messages.findIndex((text, index) => voiceSuitable(text) && !(index === 0 && response?.attachment));
  return { response, messages, spoken };
}

export class ChatWorkflow extends WorkflowEntrypoint<Env, ChatJob | VisitJob | GroupJob | InitiativeJob> {
  async run(event: WorkflowEvent<ChatJob | VisitJob | GroupJob | InitiativeJob>, step: WorkflowStep) {
    if ('kind' in event.payload) {
      if (event.payload.kind === 'initiative') await runInitiative(this.env, event.payload, step);
      else if (event.payload.kind === 'group') await runGroup(this.env, event.payload, step);
      // Visits no longer connect contacts; legacy instances finish immediately.
      return;
    }
    const job = event.payload;
    const model = await step.do('select-account-model', () => jobModel(this.env, job.turnID, false));
    const env: Env = { ...this.env, META_CHAT_MODEL: model };
    const admitted = await step.do('check-attention', async () => !!await env.DB.prepare(
      'SELECT turn_id FROM agent_attention WHERE turn_id = ? AND attempt = ?')
      .bind(job.turnID, job.attempt).first());
    if (!admitted) return;
    try {
      // Delivered → online → read → typing. Keep the queued agent disconnected
      // until it actually starts handling the message.
      await step.sleep('connect-delay', '1 second');
      await waitForComposer(env, job, step, 'before-reply', 6);
      const batched = await step.do('batch-consecutive-messages', () => batchIntoNext(env, job));
      if (batched) {
        await step.do('release-batched-attention', () => releaseAttention(env, job));
        return;
      }
      await step.do('mark-running', async () => {
        await env.DB.prepare(`UPDATE chat_turn SET status = 'running', updated_at = ?1
          WHERE id = ?2 AND attempt = ?3 AND status = 'queued'`)
          .bind(Date.now(), job.turnID, job.attempt).run();
        return true;
      });
      // mark-running connected the contact (agent_chat_status); it reads after a beat.
      await step.sleep('read-delay', '1 second');
      const readAt = await step.do('mark-read', () => markRead(env.DB, job));
      const listening = await this.listen(env, job, step);
      await this.refreshMemory(env, job, step, 'refresh-prior-memory', false);
      await this.refreshAgentMemory(env, job, step, 'refresh-agent-self-memory');
      const reading = listening ?? await step.do('reading-time', async () => {
        const turn = await activeTurn(env.DB, job);
        return readAt + readingDelay(turn?.userText ?? '');
      });
      await pauseUntil(step, 'reading-pause', reading);
      const prepared = await step.do('prepare-reply', {
        retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
        timeout: '8 minutes',
      }, async () => {
        if (await batchIntoNext(env, job)) return null;
        const turn = await activeTurn(env.DB, job);
        if (!turn || turn.status === 'complete' || turn.status === 'failed') return null;
        const contact = await env.DB.prepare('SELECT name FROM contact WHERE id = ?1 AND user_id = ?2')
          .bind(turn.contactID, turn.userID).first<{ name: string }>();
        if (!contact) return null;
        // When replies may be spoken, the format is unknown until generation ends, so the
        // contact stays online and shows Typing or Recording only once the reply exists.
        const voice = await privateVoiceReplies(env, turn.contactID);
        if (!voice) await markTyping(env.DB, job);
        const typingAt = Date.now();
        const reply = await contactReply(env, turn, contact.name);
        return { reply, typingAt, voice };
      });
      if (prepared) {
        const { messages, spoken } = replyMessages(prepared.reply);
        const first = messages[0];
        const typingAt = first && prepared.voice ? await step.do('mark-composing', async () => {
          await markTyping(env.DB, job);
          if (spoken === 0) await markRecording(env.DB, job.turnID, job.attempt);
          return Date.now();
        }) : prepared.typingAt;
        // Fast generations still show a plausible amount of typing.
        if (first && typeof typingAt === 'number') {
          await pauseUntil(step, 'typing-pause', typingAt + messageDelay(first));
        }
        const hold = await step.do('reply-timing-decision', {
          retries: { limit: 0, delay: '1 second' }, timeout: '1 minute',
        }, () => shouldHoldReply(env, job, typeof prepared.reply === 'string' ? prepared.reply : (Array.isArray(prepared.reply) ? prepared.reply : prepared.reply?.messages)?.join('\n\n') ?? null)).catch(() => false);
        if (hold) await waitForComposer(env, job, step, 'before-publish', 3);
        await this.publishMessages(env, job, step, prepared.reply);
      }
    } catch (error) {
      const code = safeErrorCode(error);
      console.error(JSON.stringify({ event: 'chat_reply_failed', code }));
      let recovered = false;
      if (['MODEL_TEMPORARILY_UNAVAILABLE', 'MODEL_INCOMPLETE_RESPONSE', 'MODEL_EMPTY_RESPONSE',
        'MODEL_INVALID_JSON', 'MODEL_INVALID_RESPONSE', 'MODEL_INVALID_TOOL_CALLS', 'MODEL_TOOL_TEXT_TOO_LARGE',
        'MODEL_RESPONSE_TOO_LARGE', 'MODEL_TOOL_BUDGET_EXCEEDED', 'REQUEST_TIMEOUT'].includes(code)) {
        try {
          const recovery = await step.do('recover-response', { retries: { limit: 0, delay: '1 second' }, timeout: '1 minute' }, async () => {
            const turn = await activeTurn(env.DB, job);
            if (!turn || turn.status !== 'running' || turn.assistantText || turn.scheduleID || turn.groupRequestID || turn.taskID) return null;
            const contact = await env.DB.prepare('SELECT name FROM contact WHERE id = ? AND user_id = ?')
              .bind(turn.contactID, turn.userID).first<{ name: string }>();
            if (!contact) return null;
            const reply = await contactReply(env, turn, contact.name, code);
            return { reply };
          });
          if (recovery) {
            await this.publishMessages(env, job, step, recovery.reply, 'recovery');
            recovered = true;
          }
        } catch (recoveryError) {
          console.error(JSON.stringify({ event: 'chat_reply_recovery_failed', code: safeErrorCode(recoveryError) }));
        }
      }
      if (!recovered) await step.do('save-failure', { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' } }, async () => {
        await env.DB.prepare(`UPDATE chat_turn SET status = CASE WHEN assistant_text IS NULL THEN 'failed' ELSE 'complete' END,
            error_code = CASE WHEN assistant_text IS NULL THEN ?4 ELSE NULL END, updated_at = ?1
          WHERE id = ?2 AND attempt = ?3 AND status IN ('queued', 'running')`)
          .bind(Date.now(), job.turnID, job.attempt, code).run();
        await enqueueReply(env.DB, job.turnID, job.attempt, Date.now()).run();
        return true;
      });
    }
    // Push failures never mark an already saved reply as failed. Cron retries the outbox.
    await step.do('deliver-push', async () => {
      try { await deliverPush(env, job.turnID); }
      catch { console.error(JSON.stringify({ event: 'push_delivery_deferred' })); }
      return true;
    });
    await this.refreshMemory(env, job, step, 'remember-completed-turn', true);
    await this.refreshAgentMemory(env, job, step, 'remember-agent-self-reply');
    await step.do('release-attention', async () => { await releaseAttention(env, job); });
    await step.do('dispatch-group-results', async () => {
      try { await dispatchGroupRequests(env); }
      catch { console.error(JSON.stringify({ event: 'group_result_dispatch_deferred' })); }
    });
    const deadline = await step.do('presence-deadline', async () => {
      const row = await env.DB.prepare(`SELECT updated_at + 30000 AS expiresAt FROM chat_turn
        WHERE id = ?1 AND attempt = ?2 AND status IN ('complete', 'failed')`)
        .bind(job.turnID, job.attempt).first<{ expiresAt: number | null }>();
      return row?.expiresAt ?? null;
    });
    if (deadline !== null) {
      await pauseUntil(step, 'presence-idle', deadline);
      await step.do('expire-presence', async () => { await expirePresence(env.DB); });
    }
  }

  // A person's voice message: read, then listen (blue microphone) and transcribe
  // once, then keep listening for the clip's duration. Returns the time to start typing.
  private async listen(env: Env, job: ChatJob, step: WorkflowStep): Promise<number | null> {
    const duration = await step.do('voice-duration', async () => {
      const turn = await activeTurn(env.DB, job);
      const audio = turn && storedAttachment(turn);
      return isVoice(audio) ? audio.durationMs : null;
    });
    if (duration === null) return null;
    await step.sleep('listen-delay', '1 second');
    const listenedAt = await step.do('mark-listened', async () => {
      const now = Date.now();
      await env.DB.prepare(`UPDATE chat_turn SET voice_listened_at = COALESCE(voice_listened_at, ?1)
        WHERE id = ?2 AND attempt = ?3 AND status = 'running'`).bind(now, job.turnID, job.attempt).run();
      return now;
    });
    await step.do('transcribe-voice', { retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '3 minutes' }, async () => {
      const turn = await activeTurn(env.DB, job);
      const audio = turn && storedAttachment(turn);
      if (!turn || turn.status !== 'running' || turn.voiceTranscribedAt || !audio) return true;
      let transcript: string;
      try { transcript = await transcribeVoice(env, audio); }
      catch (error) {
        console.error(JSON.stringify({ event: 'voice_transcription_failed', code: error instanceof TranscriptionFailure ? error.code : safeErrorCode(error) }));
        // Provider rejections and missing audio will not succeed on a Workflow retry.
        if ((error instanceof TranscriptionFailure && error.code !== 'UNAVAILABLE')
          || (error instanceof Error && error.message === 'ATTACHMENT_UNAVAILABLE')) throw new NonRetryableError('VOICE_TRANSCRIPTION_FAILED');
        throw new Error('VOICE_TRANSCRIPTION_FAILED');
      }
      await env.DB.prepare(`UPDATE chat_turn SET user_text = ?1, voice_transcribed_at = ?2
        WHERE id = ?3 AND attempt = ?4 AND voice_transcribed_at IS NULL`).bind(transcript, Date.now(), job.turnID, job.attempt).run();
      return true;
    });
    return listenedAt + Math.min(duration, 60_000);
  }

  private async publishMessages(env: Env, job: ChatJob, step: WorkflowStep, reply: ContactResponse | string[] | string | null, prefix = 'reply') {
    const { response, messages, spoken } = replyMessages(reply);
    for (let index = 0; index < Math.max(1, messages.length); index++) {
      // A later spoken message shows Recording, not Typing, during its pause.
      if (index && index === spoken) await step.do(`${prefix}-mark-recording-${index}`, async () => {
        const turn = await activeTurn(env.DB, job);
        if (turn?.status === 'running' && await privateVoiceReplies(env, turn.contactID)) await markRecording(env.DB, job.turnID, job.attempt);
        return true;
      });
      if (index) await step.sleep(`${prefix}-message-pause-${index}`, messageDelay(messages[index]));
      // Checkpointed separately so publication retries never synthesize twice.
      const voice = index === spoken ? await step.do(`${prefix}-voice-message-${index}`, { retries: { limit: 0, delay: '1 second' }, timeout: '2 minutes' }, async () => {
        const turn = await activeTurn(env.DB, job);
        if (!turn || turn.status !== 'running' || !await privateVoiceReplies(env, turn.contactID)) return null;
        const agent = await env.DB.prepare('SELECT agent_id AS id FROM contact WHERE id = ?').bind(turn.contactID).first<{ id: string }>();
        return agent ? speakMessage(env, { turnID: job.turnID, attempt: job.attempt, agentID: agent.id, text: messages[index],
          key: `attachments/${turn.userID}/${turn.contactID}/${job.turnID}/voice-a${job.attempt}-${index}` }) : null;
      }).catch(() => null) : null;
      const more = await step.do(`${prefix}-publish-message-${index}`, async () => {
        const now = Date.now();
        const resultAllowed = groupRequestTurnAllowed('chat_turn', env.META_CHAT_MODEL.includes('contributor'));
        const workAllowed = privateTaskAccess('chat_turn');
        const delivered = await activeTurn(env.DB, job);
        if (!delivered || delivered.status !== 'running') return false;
        if (!await contactModelAllowed(env, delivered.contactID, delivered.userID)) throw new Error('MODEL_CONSENT_REQUIRED');
        const previous: AssistantMessage[] = delivered.assistantMessagesJSON ? JSON.parse(delivered.assistantMessagesJSON) : [];
        // A crash after the transaction but before its checkpoint must not append twice.
        if (previous.length > index) return true;
        // Recheck profile versions and conversation access after inference/pauses.
        const attachment = index === 0 && response?.attachment ? await generatedImage(env, {
          agentID: (await env.DB.prepare('SELECT agent_id AS id FROM contact WHERE id = ?').bind(delivered.contactID).first<{ id: string }>())!.id,
          userID: delivered.userID, contactID: delivered.contactID, contributor: env.META_CHAT_MODEL.includes('contributor') && !await privateContact(env.DB, delivered.contactID),
          beforeSequence: delivered.sequence + 1, turnID: job.turnID, attempt: job.attempt,
        }) : null;
        const next = messages[index] ? [...previous, { id: `${job.turnID}/assistant/${index}`, text: messages[index], createdAt: now, ...(attachment ?? voice ? { attachment: attachment ?? voice } : {}), ...(index === 0 && response?.replyTo ? { replyTo: response.replyTo } : {}) }] : previous;
        const interrupted = `EXISTS (SELECT 1 FROM chat_turn newer WHERE newer.contact_id = chat_turn.contact_id
          AND newer.user_id = chat_turn.user_id AND newer.sequence > chat_turn.sequence)`;
        const text = next.length ? next.map(message => message.text).join('\n\n') : null;
        await env.DB.batch([
          ...(index === 0 ? [batchStatement(env, job)] : []),
          env.DB.prepare(`UPDATE chat_turn SET assistant_text = ?1, assistant_messages_json = ?5,
            status = CASE WHEN ?6 = 1 THEN 'complete' ELSE 'running' END, error_code = NULL, updated_at = ?2
            WHERE id = ?3 AND attempt = ?4 AND status = 'running'
            AND json_array_length(COALESCE(assistant_messages_json, '[]')) = ?7
            AND ${scheduleAllowed('chat_turn')} AND ${resultAllowed} AND ${workAllowed}
            AND EXISTS (SELECT 1 FROM agent_attention WHERE turn_id = ?3 AND attempt = ?4)
            ${index ? `AND NOT (${interrupted})` : ''}`)
            .bind(text, now, job.turnID, job.attempt, JSON.stringify(next), index === messages.length - 1 || !messages.length ? 1 : 0, index),
          env.DB.prepare(`UPDATE chat_turn SET status = CASE WHEN task_id IS NOT NULL OR assistant_text IS NOT NULL THEN 'complete' ELSE 'failed' END,
            error_code = CASE WHEN task_id IS NULL AND assistant_text IS NULL THEN 'GROUP_REQUEST_CANCELLED' ELSE NULL END, updated_at = ?1
            WHERE id = ?2 AND attempt = ?3 AND status = 'running'
            AND (NOT (${resultAllowed}) OR NOT (${scheduleAllowed('chat_turn')}) OR NOT (${workAllowed})
              ${index ? `OR (${interrupted})` : ''})`).bind(now, job.turnID, job.attempt),
          enqueueReply(env.DB, job.turnID, job.attempt, now),
        ]);
        return (await activeTurn(env.DB, job))?.status === 'running';
      });
      if (!more) break;
    }
  }

  private async refreshAgentMemory(env: Env, job: ChatJob, step: WorkflowStep, name: string) {
    try {
      await step.do(name, { retries: { limit: 1, delay: '5 seconds' }, timeout: '1 minute' }, async () => {
        const row = await env.DB.prepare(`SELECT c.agent_id AS id, c.id AS contactID FROM chat_turn t JOIN contact c ON c.id = t.contact_id
          JOIN agent_attention attention ON attention.turn_id = t.id AND attention.attempt = t.attempt
          WHERE t.id = ? AND t.attempt = ? AND t.status IN ('running', 'complete') AND ${privateTaskAccess('t')}`)
          .bind(job.turnID, job.attempt).first<{ id: string; contactID: string }>();
        if (row) await maintainAgentMemories(env, row.id, await jobAccountID(env, job.turnID, false), { contactID: row.contactID });
        return true;
      });
    } catch { console.error(JSON.stringify({ event: 'agent_memory_deferred' })); }
  }

  private async refreshMemory(env: Env, job: ChatJob, step: WorkflowStep, name: string, includeCurrent: boolean) {
    try {
      await step.do(name, { retries: { limit: 1, delay: '5 seconds' }, timeout: '1 minute' }, async () => {
        const turn = await activeTurn(env.DB, job);
        if (!turn || (turn.taskID && !await env.DB.prepare(`SELECT id FROM chat_turn WHERE id = ? AND ${privateTaskAccess('chat_turn')}`).bind(turn.id).first()) || turn.groupRequestID || (includeCurrent && turn.status !== 'complete') || turn.status === 'failed') return false;
        const { results } = await env.DB.prepare(`SELECT c.id, c.user_id AS userID FROM contact c
          WHERE c.agent_id = (SELECT agent_id FROM contact WHERE id = ?1) AND (?2 = 0 OR c.id = ?1)`)
          .bind(turn.contactID, includeCurrent ? 1 : 0).all<{ id: string; userID: string }>();
        for (const member of results) {
          await maintainMemories(env, { contactID: member.id, userID: member.userID,
            beforeSequence: member.id === turn.contactID ? turn.sequence + (includeCurrent ? 1 : 0) : Number.MAX_SAFE_INTEGER });
        }
        return true;
      });
    } catch {
      console.error(JSON.stringify({ event: 'chat_memory_deferred' }));
    }
  }
}
