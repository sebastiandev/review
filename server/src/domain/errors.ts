/** Base for rule violations a Command surfaces to the application (mapped to 409 / 404). */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = new.target.name
  }
}

/** The referenced row does not exist. */
export class NotFound extends DomainError {
  constructor(entity: string, id: number | string) {
    super('not_found', `${entity} ${id} not found`)
  }
}

/** The open draft targets a head sha the PR has moved past. */
export class DraftStale extends DomainError {
  constructor(
    readonly draftHeadSha: string,
    readonly currentHeadSha: string,
  ) {
    super('draft_stale', `draft is for ${draftHeadSha}, head is ${currentHeadSha}`)
  }
}

/** APPROVE was requested without the explicit confirmation flag. */
export class ApproveNotConfirmed extends DomainError {
  constructor() {
    super('approve_not_confirmed', 'approving requires confirmApprove')
  }
}

/** Some selected draft comments no longer point at lines in the diff. */
export class InvalidAnchors extends DomainError {
  constructor(readonly ids: number[]) {
    super('invalid_anchors', `comments ${ids.join(', ')} are not anchorable`)
  }
}

/** The PR has no worktree on disk yet; `openPullRequest` has to run first. */
export class WorktreeMissing extends DomainError {
  constructor(prId: number) {
    super('worktree_missing', `pull request ${prId} has no worktree; open it first`)
  }
}

/** The checkout cannot supply source for the revision being reviewed. */
export class WorktreeRevisionMismatch extends DomainError {
  constructor(expected: string, actual: string) {
    super('worktree_revision_mismatch', `worktree is at ${actual}, expected ${expected}; refresh the PR before reviewing`)
  }
}

/** The provider's CLI is not logged in, so there is no token to borrow. */
export class CliNotAuthenticated extends DomainError {
  constructor(cli: string) {
    super('cli_not_authenticated', `${cli} is not logged in; run \`${cli} auth login\` or use the device flow`)
  }
}

/** The device flow needs an OAuth client id and none is configured. */
export class DeviceFlowUnavailable extends DomainError {
  constructor() {
    super('device_flow_unavailable', 'no OAuth client id configured (REVIEW_GITHUB_CLIENT_ID)')
  }
}

/** The user denied the device authorization, or the code expired. */
export class DeviceFlowFailed extends DomainError {
  constructor(message: string) {
    super('device_flow_failed', message)
  }
}

/** The PR is merged or closed remotely; reviews can no longer be submitted. */
export class PullRequestClosed extends DomainError {
  constructor(readonly state: 'merged' | 'closed') {
    super('pr_closed', `pull request is ${state}`)
  }
}
