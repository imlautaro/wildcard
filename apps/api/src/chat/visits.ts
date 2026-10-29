// Chat visits pace replies and follow-ups but never connect the contact
// (migration 0045). The job type remains so older Workflow instances finish.
export type VisitJob = { kind: 'visit'; visitID: string; contactID: string; userID: string };
