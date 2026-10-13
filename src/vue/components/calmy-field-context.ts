import type { ComputedRef, InjectionKey } from 'vue'

export interface CalmyFieldContext {
  controlId: ComputedRef<string>
  labelId: ComputedRef<string>
  describedBy: ComputedRef<string | undefined>
  required: ComputedRef<boolean>
  invalid: ComputedRef<boolean>
}

export const calmyFieldContextKey: InjectionKey<CalmyFieldContext> = Symbol('calmy-field-context')
