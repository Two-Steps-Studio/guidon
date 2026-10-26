import { startTransition, type FormEvent } from "react";

/**
 * React 19 resets a `<form action={...}>` after every action that doesn't
 * throw - including one that returns a validation error, so a rejected save
 * wiped what the person had typed. Submit through this instead
 * (`onSubmit={(event) => submitKeepingValues(event, formAction)}`): the
 * action runs the same way (useActionState's pending/state, in a
 * transition) and the fields keep their values. Successful dialogs close,
 * which clears them anyway.
 */
export function submitKeepingValues(event: FormEvent<HTMLFormElement>, action: (data: FormData) => void) {
  event.preventDefault();
  const submitter = (event.nativeEvent as SubmitEvent).submitter;
  const data = submitter ? new FormData(event.currentTarget, submitter) : new FormData(event.currentTarget);
  startTransition(() => action(data));
}
