// ── Infra (fase 01) ──────────────────────────────────────────────────────
export { ApiError, createApiClient, get, type ApiClientOptions } from './lib/api-client';
export {
  configureApiClient,
  getApiClient,
  resetApiClient,
  type ApiClientHooks,
} from './lib/browser-client';
export { cn } from './lib/cn';
export { QueryProvider, createQueryClient, type QueryProviderProps } from './providers/query-provider';
export { ApiStatus } from './components/api-status';
export { PlaceholderScreen, type PlaceholderScreenProps } from './components/placeholder-screen';

// ── Ícones (fase 02) ─────────────────────────────────────────────────────
export * from './icons';

// ── Formulário ───────────────────────────────────────────────────────────
export {
  Button,
  IconButton,
  buttonClasses,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  type IconButtonProps,
} from './components/button';
export { Field, controlClasses, describedBy, useFieldIds, type FieldOwnProps, type FieldProps } from './components/field';
export { Input, type InputProps } from './components/input';
export { Textarea, type TextareaProps } from './components/textarea';
export { Select, type SelectOption, type SelectProps } from './components/select';
export { OtpInput, type OtpInputProps } from './components/otp-input';
export {
  PasswordInput,
  isPasswordValid,
  passwordStrength,
  type PasswordInputProps,
} from './components/password-input';
export { Checkbox, Radio, Switch } from './components/toggle';

// ── Overlays ─────────────────────────────────────────────────────────────
export { Drawer, Modal, type DrawerProps, type OverlayProps } from './components/overlay';
export { Toast, ToastProvider, useToast, type ToastOptions, type ToastProps, type ToastTone } from './components/toast';
export { SuccessScreen, type SuccessScreenProps, type SuccessSummaryRow } from './components/success-screen';

// ── Estrutura e conteúdo ─────────────────────────────────────────────────
export { Card, CardHeader, type CardHeaderProps, type CardProps } from './components/card';
export {
  APPOINTMENT_STATUS_APPEARANCE,
  AppointmentStatusPill,
  Badge,
  StatusPill,
  type BadgeProps,
  type BadgeTone,
  type StatusPillProps,
} from './components/badge';
export { TabPanel, Tabs, type TabItem, type TabPanelProps, type TabsProps } from './components/tabs';
export { Menu, type MenuItem, type MenuProps } from './components/menu';
export {
  Popover,
  PopoverDivider,
  PopoverItem,
  type PopoverItemProps,
  type PopoverProps,
} from './components/popover';
export { Segmented, type SegmentedOption, type SegmentedProps } from './components/segmented';
export { ResponsiveTable, type ResponsiveTableProps, type TableColumn } from './components/responsive-table';
export { EmptyState, type EmptyStateProps } from './components/empty-state';
export { Skeleton, SkeletonGroup, type SkeletonGroupProps, type SkeletonProps } from './components/skeleton';
export { Avatar, initialsOf, type AvatarProps, type AvatarSize } from './components/avatar';
export { StatCard, type StatCardProps, type StatDelta } from './components/stat-card';
export {
  DONUT_PALETTE,
  Donut,
  donutColor,
  type DonutProps,
  type DonutSlice,
} from './components/donut';
export { AreaChart, type AreaChartPoint, type AreaChartProps } from './components/area-chart';

// ── Agenda ───────────────────────────────────────────────────────────────
export { DatePicker, DayPill, type DatePickerProps, type DayOption, type DayPillProps } from './components/date-picker';
export {
  TimeChip,
  TimeSlotGrid,
  type TimeChipProps,
  type TimeSlotGridProps,
  type TimeSlotGroup,
} from './components/time-chip';

// ── Casca da app ─────────────────────────────────────────────────────────
export { AppShell, type AppShellNavItem, type AppShellProps } from './components/app-shell';

// ── Auth (fase 03) ───────────────────────────────────────────────────────
export {
  clientApi,
  establishmentApi,
  onboardingApi,
  type ClientRegisterInput,
  type LinkClientAccountInput,
  type RegisterEstablishmentInput,
} from './auth/auth-api';
export {
  EstablishmentAuthProvider,
  authErrorCode,
  authErrorMessage,
  useEstablishmentAuth,
  type EstablishmentAuthContextValue,
  type EstablishmentAuthState,
} from './auth/establishment-auth';
export {
  ClientAuthProvider,
  useClientAuth,
  type ClientAuthContextValue,
} from './auth/client-auth';
export {
  RequireEstablishmentAuth,
  type RequireEstablishmentAuthProps,
} from './auth/require-auth';
export {
  centsToInput,
  digitsOnly,
  inputToCents,
  maskCepInput,
  maskInstagramInput,
  maskPhoneInput,
} from './auth/masks';

// ── Hooks de overlay (reuso nas fases seguintes) ─────────────────────────
export {
  useEscapeKey,
  useFocusTrap,
  useIsMounted,
  useMountTransition,
  useScrollLock,
} from './lib/use-overlay';
