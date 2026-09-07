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
