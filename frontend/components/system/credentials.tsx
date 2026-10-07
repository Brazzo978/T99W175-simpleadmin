"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRoundIcon, Trash2Icon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { useSessionInfo } from "@/components/auth/session-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { authFetch } from "@/lib/auth-fetch";

// cgi-bin/manage_credentials: GET ?action=list, POST form-encoded
// action=add|update_password|update_role|delete with username/password/role.
const ENDPOINT = "/cgi-bin/manage_credentials";

type Role = "admin" | "user";
interface User {
  username: string;
  role: Role;
}

async function manage(fields: Record<string, string>) {
  try {
    const resp = await authFetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
    const json = await resp.json().catch(() => ({ success: false }));
    return { ok: resp.ok && json.success, message: json.message as string | undefined };
  } catch {
    return { ok: false, message: "Modem unreachable" };
  }
}

function RoleSelect({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Role)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="admin">Admin</SelectItem>
        <SelectItem value="user">User (read only)</SelectItem>
      </SelectContent>
    </Select>
  );
}

export default function CredentialsComponent() {
  const session = useSessionInfo();
  const [users, setUsers] = useState<User[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "user" as Role });
  const [selected, setSelected] = useState<string>("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const resp = await authFetch(`${ENDPOINT}?action=list`, { cache: "no-store" });
      const json = await resp.json();
      if (!json.success) throw new Error(json.message);
      setUsers(json.data as User[]);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Unable to read the users");
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const target = users?.find((u) => u.username === selected) ?? null;

  const run = async (fields: Record<string, string>, success: string) => {
    setBusy(true);
    const result = await manage(fields);
    setBusy(false);
    if (result.ok) {
      toast.success(success);
      await load();
      return true;
    }
    toast.error(result.message || "Operation failed");
    return false;
  };

  const isAdmin = session?.role === "admin";

  return (
    <PageShell
      title="Credentials"
      description="Accounts of the web interface. Read-only users can look at everything but change nothing."
    >
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>Select a user to change it.</CardDescription>
        </CardHeader>
        <CardContent>
          {!users ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow
                    key={u.username}
                    data-state={u.username === selected ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => {
                      setSelected(u.username);
                      setRole(u.role);
                      setPassword("");
                    }}
                  >
                    <TableCell className="font-medium">
                      {u.username}
                      {u.username === session?.username && (
                        <Badge variant="secondary" className="ml-2">you</Badge>
                      )}
                    </TableCell>
                    <TableCell>{u.role === "admin" ? "Admin" : "User"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add User</CardTitle>
          <CardDescription>Passwords are stored as SHA-512 crypt hashes.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="new-username">Username</Label>
            <Input
              id="new-username"
              autoComplete="off"
              value={newUser.username}
              onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password">Password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label>Role</Label>
            <RoleSelect value={newUser.role} onChange={(r) => setNewUser({ ...newUser, role: r })} />
          </div>
        </CardContent>
        <CardFooter>
          <Button
            disabled={!isAdmin || busy || !newUser.username.trim() || !newUser.password}
            onClick={async () => {
              const ok = await run(
                { action: "add", username: newUser.username.trim(), password: newUser.password, role: newUser.role },
                "User added",
              );
              if (ok) setNewUser({ username: "", password: "", role: "user" });
            }}
          >
            <UserPlusIcon />
            Add User
          </Button>
        </CardFooter>
      </Card>

      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>{target ? `Change ${target.username}` : "Change a User"}</CardTitle>
          <CardDescription>
            {target ? "New password, role, or removal." : "Select a user in the table first."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 @md/main:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="upd-password">New password</Label>
            <div className="flex gap-2">
              <Input
                id="upd-password"
                type="password"
                autoComplete="new-password"
                disabled={!target}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={!isAdmin || !target || !password || busy}
                onClick={async () => {
                  if (await run({ action: "update_password", username: selected, password }, "Password changed")) {
                    setPassword("");
                  }
                }}
              >
                <KeyRoundIcon />
                Set
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Role</Label>
            <div className="flex gap-2">
              <RoleSelect value={role} onChange={setRole} />
              <Button
                variant="outline"
                disabled={!isAdmin || !target || role === target?.role || busy}
                onClick={() => run({ action: "update_role", username: selected, role }, "Role changed")}
              >
                Set
              </Button>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            variant="destructive"
            disabled={!isAdmin || !target || busy || target?.username === session?.username}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2Icon />
            Remove User
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selected}?</AlertDialogTitle>
            <AlertDialogDescription>
              The account is deleted. A session it has open stays valid until it
              expires or the modem restarts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                setConfirmDelete(false);
                if (await run({ action: "delete", username: selected }, "User removed")) setSelected("");
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
