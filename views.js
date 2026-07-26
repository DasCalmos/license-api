function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "short",
        day: "2-digit"
    }).format(date);
}

function formatDateTime(value) {
    const date = new Date(Number(value));
    if (Number.isNaN(date.getTime())) return "Unknown";
    return new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

function liteBansStatus(record) {
    if (record.type === "kicks") return { label: "Recorded", className: "neutral" };
    if (record.active) {
        return {
            label: record.until > 0 ? `Until ${formatDateTime(record.until)}` : "Permanent",
            className: "active"
        };
    }
    return { label: "Expired / removed", className: "inactive" };
}

// A new process is started for every deploy. Versioning asset URLs prevents an
// older immutable CSS/JS response from being combined with newer HTML.
const ASSET_VERSION = process.env.RENDER_GIT_COMMIT || Date.now().toString(36);

function pageShell({ title, body, csrfToken = "", pageClass = "" }) {
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="csrf-token" content="${escapeHtml(csrfToken)}">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/assets/admin.css?v=${escapeHtml(ASSET_VERSION)}">
</head>
<body class="${escapeHtml(pageClass)}">
${body}
<script src="/assets/admin.js?v=${escapeHtml(ASSET_VERSION)}" defer></script>
</body>
</html>`;
}

function renderLogin({ csrfToken, message = "" }) {
    return pageShell({
        title: "Sign in · Calmo License",
        csrfToken,
        pageClass: "login-page",
        body: `
<main class="login-layout">
    <section class="login-intro" aria-label="Product introduction">
        <a class="brand brand-large" href="/" aria-label="Calmo License home">
            <span class="brand-mark" aria-hidden="true"><span></span></span>
            <span>Calmo<span class="brand-muted">License</span></span>
        </a>
        <div class="intro-copy">
            <span class="eyebrow"><span class="status-dot"></span> License service online</span>
            <h1>Control access.<br><span>Keep it simple.</span></h1>
            <p>A focused control center for license keys and team permissions.</p>
        </div>
        <div class="intro-foot">Secure administration · Existing plugin API preserved</div>
    </section>

    <section class="login-panel">
        <form class="login-card" method="post" action="/login" autocomplete="off">
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            <header>
                <span class="mobile-brand"><span class="brand-mark small"><span></span></span> Calmo License</span>
                <p class="kicker">Welcome back</p>
                <h2>Sign in to your panel</h2>
                <p>Use your administrator credentials to continue.</p>
            </header>
            ${message ? `<div class="alert" role="alert">${escapeHtml(message)}</div>` : ""}
            <label class="field">
                <span>Username</span>
                <span class="input-wrap"><span class="field-icon" aria-hidden="true">@</span><input name="user" autocomplete="off" data-1p-ignore data-lpignore="true" minlength="3" maxlength="32" placeholder="user" required autofocus></span>
            </label>
            <label class="field">
                <span>Password</span>
                <span class="input-wrap"><span class="field-icon lock" aria-hidden="true"></span><input name="pass" type="password" autocomplete="new-password" data-1p-ignore data-lpignore="true" required></span>
            </label>
            <button class="button button-primary button-wide" type="submit">Sign in <span aria-hidden="true">→</span></button>
            <p class="form-note">Sessions expire automatically after inactivity.</p>
        </form>
    </section>
</main>`
    });
}

function permissionToggle(user, permission, label, disabled = false) {
    const checked = user.permissions?.[permission] ? " checked" : "";
    const lock = disabled ? " disabled" : "";
    return `<label class="permission"><input class="p-${permission}" type="checkbox"${checked}${lock}><span>${escapeHtml(label)}</span></label>`;
}

function renderAdmin({ currentUser, keys, users, totalKeys, totalUsers, liteBans = null, csrfToken }) {
    const perms = currentUser.permissions;
    const keyRows = keys.map(key => `
        <tr class="key-row" data-search="${escapeHtml(key.key.toLowerCase())}">
            <td><span class="key-value"><span class="key-glyph" aria-hidden="true"></span>${escapeHtml(key.key)}</span></td>
            <td class="date-cell">${escapeHtml(formatDate(key.createdAt))}</td>
            <td class="action-cell"><div class="row-actions"><button class="icon-button key-copy" data-key="${escapeHtml(key.key)}" type="button" aria-label="Copy ${escapeHtml(key.key)}">&#10697;</button>${perms.deleteKeys ? `<button class="icon-button danger key-delete" data-key="${escapeHtml(key.key)}" type="button" aria-label="Delete ${escapeHtml(key.key)}">×</button>` : ""}</div></td>
        </tr>`).join("");

    const userCards = users.map(user => {
        const isCurrent = String(user._id) === String(currentUser._id);
        const owner = user.isOwner === true;
        return `
        <article class="user-card user-row" data-id="${escapeHtml(user._id)}">
            <div class="user-identity">
                <span class="avatar">${escapeHtml(user.username.slice(0, 1).toUpperCase())}</span>
                <div><strong>${escapeHtml(user.username)}</strong><div class="badges">${owner ? `<span class="badge owner">Owner</span>` : ""}${isCurrent ? `<span class="badge">You</span>` : ""}<span class="joined">Joined ${escapeHtml(formatDate(user.createdAt))}</span></div></div>
            </div>
            ${owner ? `<div class="admin-access"><span class="lock-badge" aria-hidden="true">&#10003;</span><div><strong>Full access</strong><span>Admin permissions are fixed and cannot be changed.</span></div></div>` : `<div class="permission-grid">
                ${permissionToggle(user, "viewKeys", "View keys")}
                ${permissionToggle(user, "addKeys", "Add keys")}
                ${permissionToggle(user, "deleteKeys", "Delete keys")}
                ${permissionToggle(user, "manageUsers", "Manage users")}
                ${permissionToggle(user, "viewLiteBans", "View LiteBans")}
            </div>`}
            <div class="user-actions">
                ${owner ? `<span class="badge owner">Hardcoded admin</span>` : `<button class="button button-secondary user-save" type="button">Save</button>`}
                ${!isCurrent && !owner ? `<button class="icon-button danger user-delete" type="button" aria-label="Delete ${escapeHtml(user.username)}">×</button>` : ""}
            </div>
        </article>`;
    }).join("");

    const liteBansRows = (liteBans?.records || []).map(record => {
        const status = liteBansStatus(record);
        const searchable = `${record.player} ${record.uuid} ${record.reason} ${record.staff} ${record.type}`.toLowerCase();
        return `
        <tr class="litebans-row" data-type="${escapeHtml(record.type)}" data-status="${record.active ? "active" : "inactive"}" data-search="${escapeHtml(searchable)}">
            <td><div class="player-cell"><span class="avatar small-avatar">${escapeHtml(record.player.slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(record.player)}</strong><span>${escapeHtml(record.uuid)}</span></div></div></td>
            <td><span class="punishment-type type-${escapeHtml(record.type)}">${escapeHtml(record.type.slice(0, -1) || record.type)}</span></td>
            <td><div class="reason-cell"><strong>${escapeHtml(record.reason)}</strong><span>by ${escapeHtml(record.staff)} · ${escapeHtml(record.server)}</span></div></td>
            <td class="date-cell">${escapeHtml(formatDateTime(record.time))}</td>
            <td><span class="punishment-status ${escapeHtml(status.className)}">${escapeHtml(status.label)}</span></td>
        </tr>`;
    }).join("");

    return pageShell({
        title: "Dashboard · Calmo License",
        csrfToken,
        pageClass: "dashboard-page",
        body: `
<div class="app-shell">
    <aside class="sidebar">
        <a class="brand" href="/admin"><span class="brand-mark"><span></span></span><span>Calmo<span class="brand-muted">License</span></span></a>
        <nav aria-label="Main navigation">
            <a class="nav-item active" href="#overview"><span class="nav-icon grid-icon" aria-hidden="true"></span>Overview</a>
            ${perms.viewKeys ? `<a class="nav-item" href="#licenses"><span class="nav-icon key-icon" aria-hidden="true"></span>Licenses</a>` : ""}
            ${perms.manageUsers ? `<a class="nav-item" href="#users"><span class="nav-icon users-icon" aria-hidden="true"></span>User</a>` : ""}
            ${perms.viewLiteBans ? `<a class="nav-item" href="#litebans"><span class="nav-icon ban-icon" aria-hidden="true"></span>LiteBans</a>` : ""}
        </nav>
        <div class="sidebar-foot">
            <div class="profile"><span class="avatar small-avatar">${escapeHtml(currentUser.username.slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(currentUser.username)}</strong><span>${currentUser.isOwner ? "Owner" : "Team member"}</span></div></div>
            <form method="post" action="/logout"><input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}"><button class="logout-button" type="submit" aria-label="Sign out">↗</button></form>
        </div>
    </aside>

    <main class="main-content">
        <header class="topbar">
            <button class="menu-button" type="button" aria-label="Open navigation">☰</button>
            <div><p class="kicker">Control center</p><h1>Good to see you, ${escapeHtml(currentUser.username)}.</h1><p>Here is what is happening with your license service.</p></div>
            <span class="service-state"><span class="status-dot"></span>Service online</span>
        </header>

        <div class="view-page active" data-view="overview">
            <section id="overview" class="stats-grid" aria-label="Overview">
                <article class="stat-card accent"><div><span class="stat-label">Active licenses</span><strong>${totalKeys}</strong><span class="stat-help">Available to your plugins</span></div><span class="stat-symbol key-icon" aria-hidden="true"></span></article>
                <article class="stat-card"><div><span class="stat-label">Users</span><strong>${totalUsers}</strong><span class="stat-help">With panel access</span></div><span class="stat-symbol users-icon" aria-hidden="true"></span></article>
                <article class="stat-card"><div><span class="stat-label">API status</span><strong class="online-text">Online</strong><span class="stat-help">Plugin checks are available</span></div><span class="stat-symbol pulse-icon" aria-hidden="true"></span></article>
            </section>
            <section class="panel overview-panel">
                <div class="panel-heading"><div><span class="section-kicker">System snapshot</span><h2>Everything in one glance</h2><p>Your license service is ready for existing Java plugins.</p></div></div>
                <div class="feature-grid">
                    <article><span class="feature-icon key-icon" aria-hidden="true"></span><div><strong>Plugin endpoint</strong><code>/license?key=...</code></div></article>
                    <article><span class="feature-icon pulse-icon" aria-hidden="true"></span><div><strong>Health check</strong><code>/ping</code></div></article>
                    <article><span class="feature-icon users-icon" aria-hidden="true"></span><div><strong>Your access</strong><span>${currentUser.isOwner ? "Administrator · Full access" : "User account"}</span></div></article>
                </div>
            </section>
        </div>

        <div class="view-page" data-view="licenses">
        ${perms.addKeys ? `
        <section class="panel quick-create">
            <div class="panel-heading"><div><span class="section-kicker">Quick action</span><h2>Create a license</h2><p>Add an existing key or generate a strong one instantly.</p></div></div>
            <form id="add-key-form" class="create-row">
                <label class="field compact"><span>License key</span><span class="input-wrap"><span class="field-icon key-glyph" aria-hidden="true"></span><input id="key" placeholder="CALMO-XXXX-XXXX-XXXX" maxlength="64" pattern="[A-Za-z0-9_-]{4,64}" required></span></label>
                <button id="generate-key" class="button button-secondary" type="button">Generate</button>
                <button class="button button-primary" type="submit">Add license</button>
            </form>
        </section>` : ""}

        ${perms.viewKeys ? `
        <section id="licenses" class="panel">
            <div class="panel-heading split"><div><span class="section-kicker">Inventory</span><h2>License keys</h2><p>${keys.length} visible ${keys.length === 1 ? "license" : "licenses"}</p></div><label class="search"><span aria-hidden="true"></span><input id="key-search" type="search" placeholder="Search licenses…" autocomplete="off"></label></div>
            <div class="table-wrap">
                <table><thead><tr><th>License key</th><th>Created</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody id="key-list">${keyRows || `<tr class="empty-row"><td colspan="3"><div class="empty-state"><span class="key-icon"></span><strong>No licenses yet</strong><p>Create the first key above.</p></div></td></tr>`}</tbody></table>
            </div>
        </section>` : `
        <section class="panel empty-state"><span class="lock-large"></span><h2>License inventory is restricted</h2><p>Your account does not have permission to view keys.</p></section>`}
        </div>

        <div class="view-page" data-view="users">
        ${perms.manageUsers ? `
        <section id="users" class="panel team-panel">
            <div class="panel-heading"><div><span class="section-kicker">Access control</span><h2>User management</h2><p>Create users and grant only the access each account needs. Admin access is fixed.</p></div></div>
            <form id="create-user-form" class="create-user">
                <div class="form-grid"><label class="field compact"><span>Username</span><input id="newUsername" minlength="3" maxlength="32" pattern="[A-Za-z0-9_-]{3,32}" placeholder="new_user" required></label><label class="field compact"><span>Temporary password</span><input id="newPassword" type="password" minlength="10" maxlength="72" placeholder="10+ characters" required></label></div>
                <div class="new-user-bottom"><div class="permission-grid create-permissions"><label class="permission"><input id="permView" type="checkbox" checked><span>View keys</span></label><label class="permission"><input id="permAdd" type="checkbox"><span>Add keys</span></label><label class="permission"><input id="permDelete" type="checkbox"><span>Delete keys</span></label><label class="permission"><input id="permUsers" type="checkbox"><span>Manage users</span></label><label class="permission"><input id="permLiteBans" type="checkbox"><span>View LiteBans</span></label></div><button class="button button-primary" type="submit">Create user</button></div>
            </form>
            <div class="user-list">${userCards}</div>
        </section>` : `<section class="panel empty-state"><span class="lock-large"></span><h2>User management is restricted</h2><p>Your account cannot manage panel users.</p></section>`}
        </div>
        ${perms.viewLiteBans ? `
        <div class="view-page" data-view="litebans">
            <section class="litebans-stats" aria-label="LiteBans overview">
                <article class="stat-card"><div><span class="stat-label">Active bans</span><strong>${liteBans?.stats?.bans || 0}</strong><span class="stat-help">Currently blocked players</span></div><span class="stat-symbol ban-icon" aria-hidden="true"></span></article>
                <article class="stat-card"><div><span class="stat-label">Active mutes</span><strong>${liteBans?.stats?.mutes || 0}</strong><span class="stat-help">Current chat restrictions</span></div><span class="stat-symbol mute-icon" aria-hidden="true"></span></article>
                <article class="stat-card"><div><span class="stat-label">Active warnings</span><strong>${liteBans?.stats?.warnings || 0}</strong><span class="stat-help">Warnings still in effect</span></div><span class="stat-symbol warning-icon" aria-hidden="true">!</span></article>
                <article class="stat-card"><div><span class="stat-label">Recorded kicks</span><strong>${liteBans?.stats?.kicks || 0}</strong><span class="stat-help">All stored kick records</span></div><span class="stat-symbol kick-icon" aria-hidden="true">↗</span></article>
            </section>
            <section class="panel litebans-panel">
                <div class="panel-heading split">
                    <div><span class="section-kicker">Moderation</span><h2>LiteBans history</h2><p>Read-only punishment data from your Minecraft network.</p></div>
                    <span class="connection-state ${liteBans?.connected ? "connected" : "disconnected"}"><span class="status-dot"></span>${liteBans?.connected ? "Database connected" : "Setup required"}</span>
                </div>
                ${!liteBans?.connected ? `<div class="integration-notice"><span class="warning-icon" aria-hidden="true">!</span><div><strong>${liteBans?.configured ? "Connection unavailable" : "Add the database password in Render"}</strong><p>${escapeHtml(liteBans?.error || "LiteBans is not configured yet.")}</p></div></div>` : `
                <div class="litebans-toolbar">
                    <label class="search"><span aria-hidden="true"></span><input id="litebans-search" type="search" placeholder="Search player, UUID, reason or staff…" autocomplete="off"></label>
                    <label class="select-wrap"><span class="sr-only">Punishment type</span><select id="litebans-type"><option value="all">All punishments</option><option value="bans">Bans</option><option value="mutes">Mutes</option><option value="warnings">Warnings</option><option value="kicks">Kicks</option></select></label>
                    <label class="select-wrap"><span class="sr-only">Punishment status</span><select id="litebans-status"><option value="all">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
                </div>
                <div class="table-wrap litebans-table-wrap">
                    <table class="litebans-table"><thead><tr><th>Player</th><th>Type</th><th>Reason</th><th>Started</th><th>Status</th></tr></thead><tbody id="litebans-list">${liteBansRows || `<tr class="empty-row"><td colspan="5"><div class="empty-state"><span class="ban-icon"></span><strong>No punishments found</strong><p>LiteBans has not stored any records yet.</p></div></td></tr>`}</tbody></table>
                </div>
                <div id="litebans-empty-filter" class="empty-filter" hidden>No punishments match these filters.</div>`}
            </section>
        </div>` : ""}
        <footer class="page-footer">Calmo License · Plugin API compatibility preserved</footer>
    </main>
</div>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
<div id="modal" class="modal" hidden><div class="modal-backdrop"></div><div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><span class="modal-icon">!</span><h2 id="modal-title">Confirm action</h2><p id="modal-message"></p><div class="modal-actions"><button id="modal-cancel" class="button button-secondary" type="button">Cancel</button><button id="modal-confirm" class="button button-danger" type="button">Delete</button></div></div></div>`
    });
}

module.exports = { renderLogin, renderAdmin, escapeHtml };
