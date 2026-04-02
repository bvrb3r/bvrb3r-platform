interface ReadableActionError {
  code?: string;
  status?: number;
  message?: string;
}

export function getReadableActionError(error: ReadableActionError | null | undefined) {
  if (!error) {
    return "Something went wrong while processing this action. Please try again.";
  }

  if (error.code === "stale_revision" || error.code === "invalid_transition") {
    return "This record changed on another screen. Review the latest status and try again.";
  }

  if (error.status === 403) {
    return "You do not have access to this action.";
  }

  const message = error.message?.trim();
  if (!message) {
    return "Something went wrong while processing this action. Please try again.";
  }

  if (/request failed|internal|exception|stack|syntax|database|fetch/i.test(message) || message.length > 140) {
    return "Something went wrong while processing this action. Please try again.";
  }

  return message;
}