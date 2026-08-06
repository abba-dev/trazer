#!/usr/bin/env python3
"""Trazer Admin Console (GUI) - create/list users, reset passwords, disable accounts.

First run asks you to create LOCAL credentials (no email) - these only
unlock this program. The Trazer admin email/password you enter in the
main window is used to talk to the Trazer API.

Pure stdlib (tkinter + urllib). Every action is written to
trazer-admin-audit.log next to this file/exe.
"""
import hashlib
import json
import os
import secrets
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from tkinter import Tk, StringVar, BooleanVar, Toplevel, messagebox, ttk

BASE = Path(sys.argv[0]).resolve().parent
AUTH_FILE = BASE / "trazer-admin-auth.json"
CONFIG_FILE = BASE / "trazer-admin-config.json"
AUDIT_FILE = BASE / "trazer-admin-audit.log"

PBKDF2_ITER = 100_000


# ---------------------------------------------------------------- auth local
def hash_password(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITER).hex()


def load_auth() -> dict:
    try:
        return json.loads(AUTH_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_auth(data: dict):
    AUTH_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def local_user_exists() -> bool:
    return bool(load_auth().get("users"))


def verify_local(user: str, password: str) -> bool:
    entry = load_auth().get("users", {}).get(user)
    if not entry:
        return False
    salt = bytes.fromhex(entry["salt"])
    return secrets.compare_digest(hash_password(password, salt), entry["hash"])


def create_local(user: str, password: str):
    data = load_auth()
    users = data.setdefault("users", {})
    salt = secrets.token_bytes(16)
    users[user] = {"salt": salt.hex(), "hash": hash_password(password, salt)}
    save_auth(data)


def load_config() -> dict:
    try:
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_config(**kv):
    cfg = load_config()
    cfg.update(kv)
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


def audit(action: str, detail: str, actor: str):
    try:
        with AUDIT_FILE.open("a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().isoformat(timespec='seconds')}] {actor}: {action} {detail}\n")
    except OSError:
        pass


# ------------------------------------------------------------------ API call
class Api:
    def __init__(self, base: str):
        self.base = base.rstrip("/")
        self.token = ""

    def call(self, method: str, path: str, body: dict | None = None) -> dict:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            f"{self.base}{path}", data=data, method=method,
            headers={"Content-Type": "application/json"},
        )
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            msg = f"HTTP {e.code}"
            try:
                msg = json.loads(e.read()).get("error", {}).get("message", msg)
            except Exception:
                pass
            raise RuntimeError(msg)
        except urllib.error.URLError as e:
            raise RuntimeError(f"Cannot reach {self.base}: {e.reason}")

    def connect(self, email: str, password: str) -> dict:
        res = self.call("POST", "/api/auth/login", {"email": email, "password": password})
        self.token = res["token"]
        return res["user"]

    def list_users(self) -> list:
        return self.call("GET", "/api/auth/users")

    def create_user(self, email: str, name: str, password: str, is_admin: bool) -> dict:
        return self.call("POST", "/api/auth/users",
                         {"email": email, "name": name, "password": password, "isAdmin": is_admin})

    def update_user(self, uid: str, **fields) -> dict:
        return self.call("PATCH", f"/api/auth/users/{uid}", fields)


# ---------------------------------------------------------------------- UI
class App(Tk):
    def __init__(self):
        super().__init__()
        self.title("Trazer Admin Console")
        self.geometry("760x480")
        self.api = Api("")
        self.connected_email = ""
        self.users = []
        self.local_user = ""
        self._build()

    def _build(self):
        if not local_user_exists():
            self._first_run()
        self._login()

    # ------------------------------------------------------- first run
    def _first_run(self):
        win = Toplevel(self)
        win.title("First run - create credentials")
        win.transient(self)
        win.grab_set()
        win.resizable(False, False)
        ttk.Label(win, text="Create the local credentials that unlock this program.\n"
                            "No email needed - a name and password are enough.").grid(row=0, column=0, columnspan=2, padx=16, pady=(14, 8))
        ttk.Label(win, text="User name:").grid(row=1, column=0, sticky="e", padx=(16, 4), pady=3)
        user_v = StringVar()
        ttk.Entry(win, textvariable=user_v, width=28).grid(row=1, column=1, sticky="w", padx=(0, 16), pady=3)
        ttk.Label(win, text="Password:").grid(row=2, column=0, sticky="e", padx=(16, 4), pady=3)
        pw_v = StringVar()
        ttk.Entry(win, textvariable=pw_v, show="*", width=28).grid(row=2, column=1, sticky="w", padx=(0, 16), pady=3)
        ttk.Label(win, text="Repeat password:").grid(row=3, column=0, sticky="e", padx=(16, 4), pady=3)
        pw2_v = StringVar()
        ttk.Entry(win, textvariable=pw2_v, show="*", width=28).grid(row=3, column=1, sticky="w", padx=(0, 16), pady=3)

        def submit():
            user = user_v.get().strip()
            pw, pw2 = pw_v.get(), pw2_v.get()
            if len(user) < 2:
                return messagebox.showwarning("Trazer Admin", "User name needs at least 2 characters", parent=win)
            if len(pw) < 6:
                return messagebox.showwarning("Trazer Admin", "Password needs at least 6 characters", parent=win)
            if pw != pw2:
                return messagebox.showwarning("Trazer Admin", "Passwords do not match", parent=win)
            create_local(user, pw)
            self.local_user = user
            win.destroy()

        ttk.Button(win, text="Create & continue", command=submit).grid(row=4, column=0, columnspan=2, pady=(12, 16))
        self.wait_window(win)

    # ------------------------------------------------------- login
    def _login(self):
        win = Toplevel(self)
        win.title("Trazer Admin - sign in")
        win.transient(self)
        win.grab_set()
        win.resizable(False, False)
        ttk.Label(win, text="Sign in to the admin console").grid(row=0, column=0, columnspan=2, padx=16, pady=(14, 8))
        ttk.Label(win, text="User name:").grid(row=1, column=0, sticky="e", padx=(16, 4), pady=3)
        user_v = StringVar()
        ttk.Entry(win, textvariable=user_v, width=28).grid(row=1, column=1, sticky="w", padx=(0, 16), pady=3)
        ttk.Label(win, text="Password:").grid(row=2, column=0, sticky="e", padx=(16, 4), pady=3)
        pw_v = StringVar()
        pw_entry = ttk.Entry(win, textvariable=pw_v, show="*", width=28)
        pw_entry.grid(row=2, column=1, sticky="w", padx=(0, 16), pady=3)

        def submit():
            if verify_local(user_v.get().strip(), pw_v.get()):
                self.local_user = user_v.get().strip()
                audit("login", "console unlocked", self.local_user)
                win.destroy()
            else:
                messagebox.showerror("Trazer Admin", "Wrong user name or password", parent=win)

        ttk.Button(win, text="Sign in", command=submit).grid(row=3, column=0, columnspan=2, pady=(12, 16))
        pw_entry.bind("<Return>", lambda _e: submit())
        self.wait_window(win)

        # ------------------------------------------------------- main
        self._build_main()

    def _build_main(self):
        for child in self.winfo_children():
            child.destroy()

        cfg = load_config()
        pad = {"padx": 8, "pady": 4}

        top = ttk.Frame(self, padding=8)
        top.pack(fill="x")
        ttk.Label(top, text="API URL:").pack(side="left")
        self.api_url_v = StringVar(value=cfg.get("api", "http://localhost:8080"))
        ttk.Entry(top, textvariable=self.api_url_v, width=24).pack(side="left", padx=4)
        ttk.Label(top, text="Admin email:").pack(side="left", padx=(10, 0))
        self.admin_email_v = StringVar(value=cfg.get("admin_email", ""))
        ttk.Entry(top, textvariable=self.admin_email_v, width=24).pack(side="left", padx=4)
        ttk.Label(top, text="Password:").pack(side="left", padx=(10, 0))
        self.admin_pw_v = StringVar()
        ttk.Entry(top, textvariable=self.admin_pw_v, show="*", width=18).pack(side="left", padx=4)
        self.connect_btn = ttk.Button(top, text="Connect", command=self._connect)
        self.connect_btn.pack(side="left", padx=8)

        self.status_v = StringVar(value="Not connected")
        ttk.Label(self, textvariable=self.status_v).pack(anchor="w", **pad)

        cols = ("email", "name", "admin", "status")
        self.tree = ttk.Treeview(self, columns=cols, show="headings", height=14)
        for c, w, a in (("email", 260, "w"), ("name", 180, "w"), ("admin", 60, "center"), ("status", 80, "center")):
            self.tree.heading(c, text=c.upper())
            self.tree.column(c, width=w, anchor=a)
        self.tree.pack(fill="both", expand=True, **pad)

        btns = ttk.Frame(self, padding=4)
        btns.pack(fill="x")
        ttk.Button(btns, text="Create user", command=self._create_user).pack(side="left", padx=4)
        ttk.Button(btns, text="Reset password", command=self._reset_password).pack(side="left", padx=4)
        ttk.Button(btns, text="Disable / enable", command=self._toggle_disabled).pack(side="left", padx=4)
        ttk.Button(btns, text="Refresh", command=self._refresh).pack(side="left", padx=4)

        self._refresh()

    # ------------------------------------------------------- actions
    def _connect(self):
        email = self.admin_email_v.get().strip()
        pw = self.admin_pw_v.get()
        if not email or not pw:
            return messagebox.showwarning("Trazer Admin", "Enter the Trazer admin email and password")
        base = self.api_url_v.get().strip()
        try:
            self.api = Api(base)
            user = self.api.connect(email, pw)
        except RuntimeError as e:
            return messagebox.showerror("Trazer Admin", str(e))
        if not user.get("isAdmin"):
            return messagebox.showerror("Trazer Admin", "This account is not an admin")
        self.connected_email = email
        self.status_v.set(f"Connected as {email} ({base})")
        save_config(api=base, admin_email=email)
        audit("connect", f"api={base} admin={email}", self.local_user)
        self.admin_pw_v.set("")
        self._refresh()

    def _refresh(self):
        if not self.api.token:
            return
        try:
            self.users = self.api.list_users()
        except RuntimeError as e:
            return messagebox.showerror("Trazer Admin", str(e))
        self.tree.delete(*self.tree.get_children())
        for u in self.users:
            self.tree.insert("", "end", iid=u["id"], values=(
                u["email"], u["name"], "yes" if u["isAdmin"] else "no",
                "disabled" if u["disabled"] else "active"))

    def _selected(self) -> dict | None:
        sel = self.tree.selection()
        if not sel:
            messagebox.showinfo("Trazer Admin", "Select a user in the list first")
            return None
        return next((u for u in self.users if u["id"] == sel[0]), None)

    def _create_user(self):
        if not self.api.token:
            return messagebox.showinfo("Trazer Admin", "Connect first (top bar)")
        win = Toplevel(self)
        win.title("Create user")
        win.transient(self)
        win.grab_set()
        win.resizable(False, False)
        email_v, name_v, pw_v, admin_v = StringVar(), StringVar(), StringVar(), BooleanVar()
        rows = (("Email", email_v, False), ("Name", name_v, False), ("Password (min 8)", pw_v, True))
        for i, (label, var, hidden) in enumerate(rows):
            ttk.Label(win, text=label).grid(row=i, column=0, sticky="e", padx=8, pady=3)
            ttk.Entry(win, textvariable=var, show="*" if hidden else "", width=30).grid(row=i, column=1, padx=8, pady=3)
        ttk.Checkbutton(win, text="Admin account", variable=admin_v).grid(row=3, column=0, columnspan=2, pady=3)

        def submit():
            email, name, pw = email_v.get().strip(), name_v.get().strip(), pw_v.get()
            if not email or not name:
                return messagebox.showwarning("Trazer Admin", "Email and name are required", parent=win)
            if len(pw) < 8:
                return messagebox.showwarning("Trazer Admin", "Password needs at least 8 characters", parent=win)
            try:
                self.api.create_user(email, name, pw, admin_v.get())
            except RuntimeError as e:
                return messagebox.showerror("Trazer Admin", str(e), parent=win)
            audit("create", f"user={email} admin={admin_v.get()}", self.local_user)
            win.destroy()
            self._refresh()

        ttk.Button(win, text="Create", command=submit).grid(row=4, column=0, columnspan=2, pady=10)
        self.wait_window(win)

    def _reset_password(self):
        user = self._selected()
        if not user or not self.api.token:
            return
        win = Toplevel(self)
        win.title("Reset password")
        win.transient(self)
        win.grab_set()
        win.resizable(False, False)
        ttk.Label(win, text=f"New password for {user['email']} (min 8 chars):").pack(padx=10, pady=(10, 4))
        pw_v = StringVar()
        ttk.Entry(win, textvariable=pw_v, show="*", width=30).pack(padx=10)

        def submit():
            pw = pw_v.get()
            if len(pw) < 8:
                return messagebox.showwarning("Trazer Admin", "Password needs at least 8 characters", parent=win)
            try:
                self.api.update_user(user["id"], password=pw)
            except RuntimeError as e:
                return messagebox.showerror("Trazer Admin", str(e), parent=win)
            audit("reset-password", f"user={user['email']}", self.local_user)
            win.destroy()

        ttk.Button(win, text="Reset", command=submit).pack(pady=10)
        self.wait_window(win)

    def _toggle_disabled(self):
        user = self._selected()
        if not user or not self.api.token:
            return
        action = "disable" if not user["disabled"] else "enable"
        if not messagebox.askyesno("Trazer Admin", f"{action.capitalize()} {user['email']}?"):
            return
        try:
            self.api.update_user(user["id"], disabled=not user["disabled"])
        except RuntimeError as e:
            return messagebox.showerror("Trazer Admin", str(e))
        audit(action, f"user={user['email']}", self.local_user)
        self._refresh()


def main():
    app = App()
    app.mainloop()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        try:
            messagebox.showerror("Trazer Admin", str(e))
        except Exception:
            pass
