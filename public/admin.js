(() => {
    "use strict";

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || "";
    const toast = document.getElementById("toast");
    const modal = document.getElementById("modal");
    let toastTimer;

    function showToast(message, error = false) {
        if (!toast) return;
        clearTimeout(toastTimer);
        toast.textContent = message;
        toast.classList.toggle("error", error);
        toast.classList.add("show");
        toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
    }

    async function request(url, body) {
        const response = await fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": csrfToken
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(await response.text() || "Request failed");
        return response.text();
    }

    function confirmAction(message) {
        if (!modal) return Promise.resolve(window.confirm(message));
        modal.hidden = false;
        modal.querySelector("#modal-message").textContent = message;
        return new Promise(resolve => {
            const cancel = modal.querySelector("#modal-cancel");
            const confirm = modal.querySelector("#modal-confirm");
            const backdrop = modal.querySelector(".modal-backdrop");
            const finish = value => {
                modal.hidden = true;
                cancel.removeEventListener("click", onCancel);
                confirm.removeEventListener("click", onConfirm);
                backdrop.removeEventListener("click", onCancel);
                document.removeEventListener("keydown", onKeydown);
                resolve(value);
            };
            const onCancel = () => finish(false);
            const onConfirm = () => finish(true);
            const onKeydown = event => {
                if (event.key === "Escape") onCancel();
            };
            cancel.addEventListener("click", onCancel);
            confirm.addEventListener("click", onConfirm);
            backdrop.addEventListener("click", onCancel);
            document.addEventListener("keydown", onKeydown);
            cancel.focus();
        });
    }

    function randomBlock(length = 4) {
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const bytes = crypto.getRandomValues(new Uint8Array(length));
        return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
    }

    document.querySelector(".menu-button")?.addEventListener("click", () => {
        document.body.classList.toggle("nav-open");
    });
    function showView(name, updateHash = false) {
        const allowed = new Set(Array.from(document.querySelectorAll("[data-view]"), item => item.dataset.view));
        const target = allowed.has(name) ? name : "overview";
        document.querySelectorAll("[data-view]").forEach(view => view.classList.toggle("active", view.dataset.view === target));
        document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.getAttribute("href") === `#${target}`));
        if (updateHash && location.hash !== `#${target}`) history.replaceState(null, "", `#${target}`);
        document.body.classList.remove("nav-open");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    document.querySelectorAll(".nav-item").forEach(link => link.addEventListener("click", event => {
        event.preventDefault();
        document.body.classList.remove("nav-open");
        showView(link.getAttribute("href").slice(1), true);
    }));
    showView(location.hash.slice(1) || "overview");
    window.addEventListener("hashchange", () => showView(location.hash.slice(1)));

    document.getElementById("generate-key")?.addEventListener("click", () => {
        const input = document.getElementById("key");
        input.value = `CALMO-${randomBlock()}-${randomBlock()}-${randomBlock()}`;
        input.focus();
        input.select();
    });

    document.getElementById("add-key-form")?.addEventListener("submit", async event => {
        event.preventDefault();
        const input = document.getElementById("key");
        const submit = event.submitter;
        try {
            if (!input.reportValidity()) return;
            if (submit) submit.disabled = true;
            await request("/api/add", { key: input.value.trim() });
            showToast("License added successfully.");
            setTimeout(() => location.reload(), 450);
        } catch (err) {
            showToast(err.message, true);
            if (submit) submit.disabled = false;
        }
    });

    document.getElementById("key-search")?.addEventListener("input", event => {
        const query = event.target.value.trim().toLowerCase();
        document.querySelectorAll(".key-row").forEach(row => {
            row.hidden = !row.dataset.search.includes(query);
        });
    });

    document.querySelectorAll(".key-copy").forEach(button => {
        button.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(button.dataset.key);
                showToast("License key copied.");
            } catch {
                showToast("Could not copy the license key.", true);
            }
        });
    });

    document.querySelectorAll(".key-delete").forEach(button => {
        button.addEventListener("click", async () => {
            if (!await confirmAction(`Delete license ${button.dataset.key}? Existing plugins using it will become invalid.`)) return;
            try {
                button.disabled = true;
                await request("/api/remove", { key: button.dataset.key });
                button.closest("tr").remove();
                showToast("License deleted.");
            } catch (err) {
                button.disabled = false;
                showToast(err.message, true);
            }
        });
    });

    document.querySelectorAll(".legacy-toggle").forEach(button => {
        button.addEventListener("click", async () => {
            const currentlyEnabled = button.dataset.enabled === "true";
            const action = currentlyEnabled ? "disable" : "enable";
            if (!await confirmAction(`${action[0].toUpperCase() + action.slice(1)} the legacy key-only endpoint for this license?`)) return;
            try {
                button.disabled = true;
                await request("/api/licenses/legacy", { id: button.dataset.id, enabled: !currentlyEnabled });
                showToast(`Legacy endpoint ${action}d.`);
                setTimeout(() => location.reload(), 450);
            } catch (err) {
                button.disabled = false;
                showToast(err.message, true);
            }
        });
    });

    document.getElementById("add-server-form")?.addEventListener("submit", async event => {
        event.preventDefault();
        const submit = event.submitter;
        try {
            if (!event.currentTarget.reportValidity()) return;
            if (submit) submit.disabled = true;
            await request("/api/servers/add", {
                name: document.getElementById("serverName").value.trim(),
                target: document.getElementById("serverTarget").value.trim(),
                licenseId: document.getElementById("serverLicense").value,
                enabled: true
            });
            showToast("Server whitelisted.");
            setTimeout(() => location.reload(), 450);
        } catch (err) {
            if (submit) submit.disabled = false;
            showToast(err.message, true);
        }
    });

    document.getElementById("server-search")?.addEventListener("input", event => {
        const query = event.target.value.trim().toLowerCase();
        document.querySelectorAll(".server-row").forEach(row => {
            row.hidden = !row.dataset.search.includes(query);
        });
    });

    document.querySelectorAll(".server-save").forEach(button => {
        button.addEventListener("click", async () => {
            const row = button.closest(".server-row");
            try {
                button.disabled = true;
                await request("/api/servers/update", {
                    id: row.dataset.id,
                    name: row.querySelector(".server-name").value.trim(),
                    target: row.querySelector(".server-target").value.trim(),
                    licenseId: row.querySelector(".server-license").value,
                    enabled: row.querySelector(".server-enabled input").checked
                });
                showToast("Server saved.");
                setTimeout(() => location.reload(), 450);
            } catch (err) {
                button.disabled = false;
                showToast(err.message, true);
            }
        });
    });

    document.querySelectorAll(".server-refresh").forEach(button => {
        button.addEventListener("click", async () => {
            const row = button.closest(".server-row");
            try {
                button.disabled = true;
                await request("/api/servers/refresh", { id: row.dataset.id });
                showToast("DNS addresses refreshed.");
                setTimeout(() => location.reload(), 450);
            } catch (err) {
                button.disabled = false;
                showToast(err.message, true);
            }
        });
    });

    document.querySelectorAll(".server-delete").forEach(button => {
        button.addEventListener("click", async () => {
            const row = button.closest(".server-row");
            const name = row.querySelector(".server-name")?.value || "this server";
            if (!await confirmAction(`Remove ${name} from the whitelist?`)) return;
            try {
                button.disabled = true;
                await request("/api/servers/remove", { id: row.dataset.id });
                row.remove();
                showToast("Server removed.");
            } catch (err) {
                button.disabled = false;
                showToast(err.message, true);
            }
        });
    });

    document.getElementById("create-user-form")?.addEventListener("submit", async event => {
        event.preventDefault();
        const username = document.getElementById("newUsername");
        const password = document.getElementById("newPassword");
        const submit = event.submitter;
        try {
            if (!event.currentTarget.reportValidity()) return;
            if (new TextEncoder().encode(password.value).length > 72) {
                throw new Error("Password must be at most 72 UTF-8 bytes.");
            }
            if (submit) submit.disabled = true;
            await request("/api/users/add", {
                username: username.value.trim(),
                password: password.value,
                permissions: {
                    viewKeys: document.getElementById("permView").checked,
                    addKeys: document.getElementById("permAdd").checked,
                    deleteKeys: document.getElementById("permDelete").checked,
                    manageUsers: document.getElementById("permUsers").checked,
                    viewLiteBans: document.getElementById("permLiteBans").checked,
                    viewServers: document.getElementById("permServers").checked,
                    manageServers: document.getElementById("permManageServers").checked
                }
            });
            showToast("User created.");
            setTimeout(() => location.reload(), 450);
        } catch (err) {
            if (submit) submit.disabled = false;
            showToast(err.message, true);
        }
    });

    document.querySelectorAll(".user-save").forEach(button => {
        button.addEventListener("click", async () => {
            const row = button.closest(".user-row");
            try {
                button.disabled = true;
                await request("/api/users/update", {
                    id: row.dataset.id,
                    permissions: {
                        viewKeys: row.querySelector(".p-viewKeys").checked,
                        addKeys: row.querySelector(".p-addKeys").checked,
                        deleteKeys: row.querySelector(".p-deleteKeys").checked,
                        manageUsers: row.querySelector(".p-manageUsers").checked,
                        viewLiteBans: row.querySelector(".p-viewLiteBans").checked,
                        viewServers: row.querySelector(".p-viewServers").checked,
                        manageServers: row.querySelector(".p-manageServers").checked
                    }
                });
                showToast("Permissions saved.");
            } catch (err) {
                showToast(err.message, true);
            } finally {
                button.disabled = false;
            }
        });
    });

    document.querySelectorAll(".user-delete").forEach(button => {
        button.addEventListener("click", async () => {
            const row = button.closest(".user-row");
            const username = row.querySelector("strong")?.textContent || "this user";
            if (!await confirmAction(`Delete ${username}? Their active session will stop working.`)) return;
            try {
                button.disabled = true;
                await request("/api/users/remove", { id: row.dataset.id });
                row.remove();
                showToast("User deleted.");
            } catch (err) {
                button.disabled = false;
                showToast(err.message, true);
            }
        });
    });

    const liteBansSearch = document.getElementById("litebans-search");
    const liteBansType = document.getElementById("litebans-type");
    const liteBansStatus = document.getElementById("litebans-status");
    function filterLiteBans() {
        const query = liteBansSearch?.value.trim().toLowerCase() || "";
        const type = liteBansType?.value || "all";
        const status = liteBansStatus?.value || "all";
        let visible = 0;
        document.querySelectorAll(".litebans-row").forEach(row => {
            const matchesQuery = !query || row.dataset.search.includes(query);
            const matchesType = type === "all" || row.dataset.type === type;
            const matchesStatus = status === "all" || row.dataset.status === status;
            row.hidden = !(matchesQuery && matchesType && matchesStatus);
            if (!row.hidden) visible += 1;
        });
        const empty = document.getElementById("litebans-empty-filter");
        if (empty) empty.hidden = visible !== 0;
    }
    liteBansSearch?.addEventListener("input", filterLiteBans);
    liteBansType?.addEventListener("change", filterLiteBans);
    liteBansStatus?.addEventListener("change", filterLiteBans);
})();
