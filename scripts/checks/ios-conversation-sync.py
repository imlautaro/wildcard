#!/usr/bin/env python3
"""Run the actual iOS stores on macOS with fictional, in-memory API responses.

Requires Xcode's Swift toolchain. Does not build/install the app, access the
network, read credentials, or use a simulator. UI/audio/APNs remain device checks.
"""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
ios = root / 'apps/ios/Wildcard'
with tempfile.TemporaryDirectory(prefix='wildcard-sync-') as directory:
    temp = Path(directory)
    # Model declarations are shared verbatim; platform-specific API extensions
    # are replaced by the deterministic transport in the test harness.
    models = '\n'.join((ios / file).read_text().split('\nextension AuthAPI {')[0]
                       for file in ('Chat/ChatAPI.swift', 'Contacts/ContactsAPI.swift'))
    models += '\n' + (ios / 'Contacts/McpConnections.swift').read_text().split('private struct McpEnvelope')[0].replace('import SwiftUI', '')
    models += '\n' + (ios / 'Groups/GroupMessageInfo.swift').read_text().split('struct GroupMessageInfoView')[0].replace('import SwiftUI', '')
    (temp / 'Models.swift').write_text(models)
    sources = [ios / file for file in (
        'Chat/MessageReactionStore.swift', 'Chat/ChatStore.swift', 'Chat/ConversationCache.swift', 'Chat/ReadAcknowledgementQueue.swift',
        'Chat/ConversationSync.swift', 'Contacts/ContactsStore.swift',
        'Groups/GroupsAPI.swift',
    )]
    executable = temp / 'checks'
    subprocess.run(['xcrun', 'swiftc', '-parse-as-library', '-swift-version', '5',
                    '-default-isolation', 'MainActor', '-module-cache-path', str(temp / 'modules'),
                    str(temp / 'Models.swift'), *map(str, sources),
                    str(root / 'scripts/checks/ios-conversation-sync.swift'), '-o', str(executable)], check=True)
    subprocess.run([str(executable)], check=True, timeout=60)
