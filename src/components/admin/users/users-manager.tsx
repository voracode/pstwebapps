"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  Copy,
  KeyRound,
  Lock,
  LockOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/form-controls";
import { Alert, Badge, EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/overlays";
import { formatDateTime, formatRelative } from "@/lib/format";

export const ROLES = ["SUPER_ADMIN", "NATIONAL_SECRETARY", "MUNICIPAL_COORDINATOR", "MEDIA_EDITOR", "AUDITOR"] as const;
type RoleValue = (typeof ROLES)[number];

export interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: RoleValue;
  status: "ACTIVE" | "DISABLED";
  municipalityId: number | null;
  municipalityName: string | null;
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
  locked: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  telegramChatId: string | null;
  createdAt: string;
}

type Action = "reset_password" | "reset_2fa" | "unlock" | "disable" | "enable" | "delete";

export function UsersManager({
  users,
  municipalities,
  currentUserId,
}: {
  users: UserRow[];
  municipalities: { id: number; name: string }[];
  currentUserId: string;
}) {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [pending, setPending] = useState<{ user: UserRow; action: Action } | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; kind: "invite" | "reset"; email: string } | null>(null);

  const run = async () => {
    if (!pending) return;
    const { user, action } = pending;
    setBusy(true);
    try {
      if (action === "delete") await api.delete(`/api/admin/users/${user.id}`);
      else if (action === "disable" || action === "enable") await api.patch(`/api/admin/users/${user.id}`, { status: action === "disable" ? "DISABLED" : "ACTIVE" });
      else {
        const res = await api.post<{ resetUrl?: string }>(`/api/admin/users/${user.id}`, { action });
        if (action === "reset_password" && res?.resetUrl) setLink({ url: res.resetUrl, kind: "reset", email: user.email });
      }
      toast.success(t(`done.${action}`));
      setPending(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiClientError && (err.status === 403 || err.status === 409) ? err.message : errorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          {t("new")}
        </Button>
      </div>

      {users.length === 0 ? (
        <EmptyState icon={Users} title={tc("states.noResults")} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{t("user")}</TH>
              <TH>{t("role")}</TH>
              <TH>{t("status")}</TH>
              <TH className="hidden md:table-cell">{t("security")}</TH>
              <TH className="hidden lg:table-cell">{t("lastLogin")}</TH>
              <TH className="w-12">
                <span className="sr-only">{t("actions")}</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {users.map((u) => {
              const self = u.id === currentUserId;
              return (
                <TR key={u.id}>
                  <TD className="max-w-xs">
                    <div className="truncate font-semibold">
                      {u.name} {self && <Badge variant="outline">{t("you")}</Badge>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                  </TD>
                  <TD>
                    <div className="whitespace-nowrap">{tc(`enums.role.${u.role}`)}</div>
                    {u.municipalityName && <div className="text-xs text-muted-foreground">{u.municipalityName}</div>}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {u.status === "ACTIVE" ? <Badge variant="success">{t("statuses.ACTIVE")}</Badge> : <Badge variant="muted">{t("statuses.DISABLED")}</Badge>}
                      {u.locked && (
                        <Badge variant="danger" title={u.lockedUntil ? formatDateTime(u.lockedUntil, locale) : undefined}>
                          <Lock className="size-3" aria-hidden />
                          {t("locked")}
                        </Badge>
                      )}
                      {u.mustChangePassword && <Badge variant="warning">{t("pendingSetup")}</Badge>}
                    </div>
                  </TD>
                  <TD className="hidden md:table-cell">
                    {u.twoFactorEnabled ? (
                      <Badge variant="info">
                        <ShieldCheck className="size-3" aria-hidden />
                        {t("twoFactorOn")}
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        <ShieldOff className="size-3" aria-hidden />
                        {t("twoFactorOff")}
                      </Badge>
                    )}
                  </TD>
                  <TD className="hidden whitespace-nowrap lg:table-cell">
                    {u.lastLoginAt ? (
                      <>
                        <span title={formatDateTime(u.lastLoginAt, locale)}>{formatRelative(u.lastLoginAt, locale)}</span>
                        {u.lastLoginIp && <div className="font-mono text-xs text-muted-foreground">{u.lastLoginIp}</div>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">{t("never")}</span>
                    )}
                  </TD>
                  <TD>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon-sm" variant="ghost" aria-label={`${t("actions")}: ${u.name}`}>
                          <MoreHorizontal aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => setEditing(u)}>
                          <Pencil aria-hidden />
                          {tc("actions.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setPending({ user: u, action: "reset_password" })} disabled={u.status === "DISABLED"}>
                          <KeyRound aria-hidden />
                          {t("actionLabels.reset_password")}
                        </DropdownMenuItem>
                        {u.twoFactorEnabled && !self && (
                          <DropdownMenuItem onSelect={() => setPending({ user: u, action: "reset_2fa" })}>
                            <ShieldOff aria-hidden />
                            {t("actionLabels.reset_2fa")}
                          </DropdownMenuItem>
                        )}
                        {u.locked && (
                          <DropdownMenuItem onSelect={() => setPending({ user: u, action: "unlock" })}>
                            <LockOpen aria-hidden />
                            {t("actionLabels.unlock")}
                          </DropdownMenuItem>
                        )}
                        {!self && (
                          <>
                            <DropdownMenuSeparator />
                            {u.status === "ACTIVE" ? (
                              <DropdownMenuItem onSelect={() => setPending({ user: u, action: "disable" })}>
                                <UserX aria-hidden />
                                {t("actionLabels.disable")}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onSelect={() => setPending({ user: u, action: "enable" })}>
                                <UserCheck aria-hidden />
                                {t("actionLabels.enable")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem destructive onSelect={() => setPending({ user: u, action: "delete" })}>
                              <Trash2 aria-hidden />
                              {tc("actions.delete")}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      {editing && (
        <UserDialog
          key={editing === "new" ? "new" : editing.id}
          user={editing === "new" ? null : editing}
          self={editing !== "new" && editing.id === currentUserId}
          municipalities={municipalities}
          onClose={() => setEditing(null)}
          onSaved={(inviteUrl, email) => {
            setEditing(null);
            if (inviteUrl) setLink({ url: inviteUrl, kind: "invite", email });
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending ? t(`confirm.${pending.action}.title`, { name: pending.user.name }) : ""}
        description={pending ? t(`confirm.${pending.action}.description`, { email: pending.user.email }) : undefined}
        confirmLabel={pending ? (pending.action === "delete" ? tc("actions.delete") : t(`actionLabels.${pending.action}`)) : tc("actions.confirm")}
        cancelLabel={tc("actions.cancel")}
        destructive={pending?.action === "delete" || pending?.action === "disable" || pending?.action === "reset_2fa"}
        loading={busy}
        onConfirm={run}
      />

      {link && <LinkDialog {...link} onClose={() => setLink(null)} />}
    </>
  );
}

function LinkDialog({ url, kind, email, onClose }: { url: string; kind: "invite" | "reset"; email: string; onClose: () => void }) {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(tc("actions.copied"));
    } catch {
      toast.error(tc("errors.generic"));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={kind === "invite" ? t("link.inviteTitle") : t("link.resetTitle")} description={t("link.description", { email })}>
        <div className="space-y-4">
          <Alert variant="warning" title={t("link.warningTitle")}>
            {t("link.warning")}
          </Alert>
          <div className="flex gap-2">
            <Input readOnly value={url} aria-label={t("link.label")} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="outline" onClick={copy}>
              <Copy aria-hidden />
              {tc("actions.copy")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("link.expires")}</p>
          <div className="flex justify-end">
            <Button onClick={onClose}>{tc("actions.close")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UserDialog({
  user,
  self,
  municipalities,
  onClose,
  onSaved,
}: {
  user: UserRow | null;
  self: boolean;
  municipalities: { id: number; name: string }[];
  onClose: () => void;
  onSaved: (inviteUrl: string | undefined, email: string) => void;
}) {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [role, setRole] = useState<RoleValue>(user?.role ?? "MEDIA_EDITOR");
  const [municipalityId, setMunicipalityId] = useState(user?.municipalityId ? String(user.municipalityId) : "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [telegramChatId, setTelegram] = useState(user?.telegramChatId ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const needsMunicipality = role === "MUNICIPAL_COORDINATOR";
  const roleChanged = !!user && user.role !== role;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (needsMunicipality && !municipalityId) local.municipalityId = t("form.municipalityRequired");
    if (telegramChatId.trim() && !/^-?\d{4,20}$/.test(telegramChatId.trim())) local.telegramChatId = t("form.telegramInvalid");
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      if (user) {
        await api.patch(`/api/admin/users/${user.id}`, {
          name: name.trim(),
          ...(self ? {} : { role }),
          municipalityId: needsMunicipality ? Number(municipalityId) : null,
          phone: phone.trim() || null,
          telegramChatId: telegramChatId.trim() || null,
        });
        toast.success(tc("states.saved"));
        onSaved(undefined, user.email);
      } else {
        const res = await api.post<{ user: { email: string }; inviteUrl?: string }>("/api/admin/users", {
          email: email.trim(),
          name: name.trim(),
          role,
          municipalityId: needsMunicipality ? Number(municipalityId) : undefined,
          phone: phone.trim() || undefined,
          telegramChatId: telegramChatId.trim() || undefined,
        });
        toast.success(res.inviteUrl ? t("createdNoMail") : t("created"));
        onSaved(res.inviteUrl, res.user.email);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        const fe = err.fieldErrors;
        if (err.status === 409 && !user) fe.email = t("form.emailTaken");
        setErrors(fe);
      }
      toast.error(err instanceof ApiClientError && (err.status === 403 || err.status === 409) ? err.message : errorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={user ? t("edit") : t("new")} description={user ? user.email : t("form.inviteHint")}>
        <form onSubmit={submit} className="space-y-4">
          {!user && (
            <Field label={t("form.email")} htmlFor="u-email" required error={errors.email}>
              <Input type="email" autoComplete="off" value={email} maxLength={160} required onChange={(e) => setEmail(e.target.value)} />
            </Field>
          )}
          <Field label={t("form.name")} htmlFor="u-name" required error={errors.name}>
            <Input value={name} minLength={2} maxLength={120} required onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t("role")} htmlFor="u-role" required hint={self ? t("form.ownRole") : undefined} error={errors.role}>
            <NativeSelect value={role} disabled={self} onChange={(e) => setRole(e.target.value as RoleValue)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {tc(`enums.role.${r}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <p className="-mt-2 text-xs text-muted-foreground">{t(`roleHints.${role}`)}</p>
          {needsMunicipality && (
            <Field label={tc("geo.municipality")} htmlFor="u-mun" required error={errors.municipalityId}>
              <NativeSelect value={municipalityId} required onChange={(e) => setMunicipalityId(e.target.value)}>
                <option value="">{tc("geo.select")}</option>
                {municipalities.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("form.phone")} htmlFor="u-phone" hint="+670 7xxx xxxx" error={errors.phone}>
              <Input type="tel" value={phone} maxLength={32} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label={t("form.telegram")} htmlFor="u-tg" hint={t("form.telegramHint")} error={errors.telegramChatId}>
              <Input inputMode="numeric" value={telegramChatId} maxLength={21} onChange={(e) => setTelegram(e.target.value)} />
            </Field>
          </div>
          {roleChanged && (
            <Alert variant="warning">
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="size-3.5" aria-hidden />
                {t("form.roleChangeWarning")}
              </span>
            </Alert>
          )}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {tc("actions.cancel")}
            </Button>
            <Button type="submit" loading={busy}>
              {user ? tc("actions.save") : t("form.createAndInvite")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
