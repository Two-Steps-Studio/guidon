"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type Field = "fullName" | "email" | "password";

export function useAuthFieldErrors() {
  const t = useTranslations("auth.common");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const setFieldError = (field: Field, message?: string) => {
    setErrors(current => ({ ...current, [field]: message }));
  };

  const validate = (field: Field, input: HTMLInputElement) => {
    const validity = input.validity;
    if (validity.valueMissing) return setFieldError(field, t("fieldRequired"));
    if (validity.typeMismatch) return setFieldError(field, t("invalidEmail"));
    if (validity.tooShort) return setFieldError(field, t("shortPassword"));
    setFieldError(field);
  };

  const fieldProps = (field: Field) => ({
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? `auth-error-${field}` : undefined,
    onBlur: (event: React.FocusEvent<HTMLInputElement>) => validate(field, event.currentTarget),
    onInvalid: (event: React.InvalidEvent<HTMLInputElement>) => validate(field, event.currentTarget),
    onInput: () => { if (errors[field]) setFieldError(field); },
  });

  return { errors, fieldProps, setFieldError };
}
