import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import {
  FiActivity,
  FiAlertCircle,
  FiArrowDownLeft,
  FiArrowUpRight,
  FiBell,
  FiCheck,
  FiCheckCircle,
  FiChevronDown,
  FiClipboard,
  FiClock,
  FiFileText,
  FiFolder,
  FiHeadphones,
  FiHome,
  FiEye,
  FiEyeOff,
  FiLock,
  FiLogOut,
  FiMenu,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiStar,
  FiUsers,
  FiX,
} from 'react-icons/fi'
import api from './services/api'
import './App.css'

const AnalyticsCharts = lazy(() => import('./components/AnalyticsCharts.jsx'))
const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed']
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']
const CHART_COLORS = ['#6477f4', '#14a990', '#f3a448', '#ed6b76', '#8a72db']

const ROLE_LABELS = {
  admin: 'Administrator',
  manager: 'Support manager',
  agent: 'Support agent',
  customer: 'Customer',
}

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function App() {
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get('token') || '')
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!resetToken && Boolean(localStorage.getItem('token')))
  const [authMode, setAuthMode] = useState(resetToken ? 'reset' : 'login')
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', newPassword: '', confirmPassword: '' })
  const [authBusy, setAuthBusy] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [page, setPage] = useState('dashboard')
  const [selectedTicketId, setSelectedTicketId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tickets, setTickets] = useState([])
  const [categories, setCategories] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [queue, setQueue] = useState([])
  const [team, setTeam] = useState([])
  const [reports, setReports] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [ticketDetails, setTicketDetails] = useState(null)
  const [comments, setComments] = useState([])
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)

  useEffect(() => {
    if (resetToken) {
      localStorage.removeItem('token')
      return undefined
    }

    const token = localStorage.getItem('token')
    if (!token) return undefined

    let active = true
    api.get('/auth/profile')
      .then(({ data }) => {
        if (active) setUser(data.user)
      })
      .catch(() => {
        localStorage.removeItem('token')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [resetToken])

  useEffect(() => {
    if (!user) return undefined
    let active = true

    async function loadPage() {
      try {
        if (page === 'dashboard') {
          const [ticketResponse, analyticsResponse] = await Promise.all([
            api.get('/tickets'),
            api.get('/portal/analytics'),
          ])
          if (!active) return
          setTickets(ticketResponse.data.tickets || [])
          setAnalytics(analyticsResponse.data)
        } else if (page === 'tickets') {
          const { data } = await api.get('/tickets')
          if (active) setTickets(data.tickets || [])
        } else if (page === 'create') {
          const { data } = await api.get('/portal/categories')
          if (active) setCategories(data.categories || [])
        } else if (page === 'queue') {
          const { data } = await api.get('/portal/agent/queue')
          if (active) setQueue(data.tickets || [])
        } else if (page === 'team') {
          const { data } = await api.get('/admin/users')
          if (active) setTeam(data.users || [])
        } else if (page === 'reports') {
          const { data } = await api.get('/admin/reports')
          if (active) setReports(data.reports)
        } else if (page === 'notifications') {
          const { data } = await api.get('/notifications')
          if (active) setNotifications(data.notifications || [])
        } else if (page === 'details' && selectedTicketId) {
          const [ticketResponse, commentsResponse] = await Promise.all([
            api.get(`/tickets/${selectedTicketId}`),
            api.get(`/portal/tickets/${selectedTicketId}/comments`),
          ])
          if (!active) return
          setTicketDetails(ticketResponse.data)
          setComments(commentsResponse.data.comments || [])
          if (['admin', 'manager'].includes(user.role)) {
            const { data } = await api.get('/admin/users?role=agent')
            if (active) setTeam(data.users || [])
          }
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.response?.data?.message || 'Unable to load this workspace.')
        }
      }
    }

    loadPage()
    return () => {
      active = false
    }
  }, [user, page, selectedTicketId, reloadVersion])

  async function submitAuth(event) {
    event.preventDefault()
    setError('')
    setAuthMessage('')
    setAuthBusy(true)
    try {
      if (authMode === 'forgot') {
        const { data } = await api.post('/auth/forgot-password', { email: authForm.email })
        setAuthMessage(data.message)
        return
      }

      if (authMode === 'reset') {
        if (!resetToken) {
          setError('This password reset link is invalid or expired. Request a new link.')
          return
        }
        if (authForm.newPassword !== authForm.confirmPassword) {
          setError('The new passwords do not match.')
          return
        }
        const { data } = await api.post('/auth/reset-password', {
          token: resetToken,
          newPassword: authForm.newPassword,
        })
        setAuthMode('login')
        setAuthForm({ name: '', email: '', password: '', newPassword: '', confirmPassword: '' })
        setAuthMessage(data.message)
        window.history.replaceState({}, '', window.location.pathname)
        return
      }

      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register'
      const payload = authMode === 'login'
        ? { email: authForm.email, password: authForm.password }
        : authForm
      const { data } = await api.post(endpoint, payload)
      localStorage.setItem('token', data.token)
      setUser(data.user)
      setPage('dashboard')
      setAuthForm({ name: '', email: '', password: '', newPassword: '', confirmPassword: '' })
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Authentication failed.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function submitPasswordChange(event) {
    event.preventDefault()
    setError('')
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('The new passwords do not match.')
      return
    }

    setPasswordBusy(true)
    try {
      const { data } = await api.post('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      showNotice(data.message)
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to change the password.')
    } finally {
      setPasswordBusy(false)
    }
  }

  function signOut() {
    localStorage.removeItem('token')
    setUser(null)
    setPage('dashboard')
    setTickets([])
    setSelectedTicketId(null)
    setTicketDetails(null)
    setError('')
  }

  function navigate(nextPage) {
    setError('')
    setNotice('')
    setMobileNavOpen(false)
    if (nextPage !== 'details') setSelectedTicketId(null)
    setPage(nextPage)
  }

  function openTicket(ticket) {
    setSelectedTicketId(ticket.id)
    setTicketDetails(null)
    setComments([])
    setPage('details')
    setError('')
    setNotice('')
  }

  function showNotice(message) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3500)
  }

  if (loading) {
    return <div className="portal-loading"><span className="loading-mark"><FiHeadphones /></span> Loading SupportHub</div>
  }

  if (!user) {
    return (
      <AuthScreen
        mode={authMode}
        form={authForm}
        error={error}
        message={authMessage}
        busy={authBusy}
        onChange={(event) => setAuthForm({ ...authForm, [event.target.name]: event.target.value })}
        onSubmit={submitAuth}
        onModeChange={(mode) => {
          setAuthMode(mode)
          setError('')
          setAuthMessage('')
        }}
      />
    )
  }

  const isCustomer = user.role === 'customer'
  const isAgent = user.role === 'agent'
  const isAdmin = user.role === 'admin'
  const canManage = ['admin', 'manager'].includes(user.role)
  const pageTitles = {
    dashboard: 'Overview',
    tickets: isCustomer ? 'My tickets' : 'Ticket workspace',
    create: 'Create a ticket',
    details: 'Ticket details',
    queue: 'Agent queue',
    team: 'Team management',
    reports: 'Reports & insights',
    notifications: 'Notifications',
    security: 'Password & security',
  }

  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: FiHome },
    { id: 'tickets', label: isCustomer ? 'My tickets' : 'Tickets', icon: FiClipboard },
    ...(isCustomer ? [{ id: 'create', label: 'Create ticket', icon: FiPlus }] : []),
    ...(isAgent ? [{ id: 'queue', label: 'Unassigned queue', icon: FiFolder }] : []),
    ...(canManage ? [
      { id: 'reports', label: 'Reports', icon: FiActivity },
      { id: 'team', label: isAdmin ? 'Team management' : 'Team directory', icon: FiUsers },
    ] : []),
    { id: 'notifications', label: 'Notifications', icon: FiBell },
    { id: 'security', label: 'Password & security', icon: FiLock },
  ]

  return (
    <div className="portal-shell">
      <aside className={`portal-sidebar ${mobileNavOpen ? 'is-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-symbol"><FiHeadphones /></div>
          <div><strong>SupportHub</strong><span>Customer care platform</span></div>
          <button className="icon-button mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><FiX /></button>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-link ${page === id || (id === 'tickets' && page === 'details') ? 'active' : ''}`}
              onClick={() => navigate(id)}
            >
              <Icon /><span>{label}</span>
              {id === 'notifications' && notifications.some((item) => !item.is_read) && <i className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <span className="help-icon"><FiShield /></span>
            <strong>Need a hand?</strong>
            <span>Our support team is here to help.</span>
          </div>
          <div className="profile-card">
            <div className="avatar">{initials(user.name)}</div>
            <div className="profile-copy"><strong>{user.name}</strong><span>{ROLE_LABELS[user.role] || user.role}</span></div>
            <button className="icon-button" onClick={signOut} title="Sign out" aria-label="Sign out"><FiLogOut /></button>
          </div>
        </div>
      </aside>

      <div className="portal-main">
        <header className="top-header">
          <button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><FiMenu /></button>
          <div className="header-title">
            <div className="breadcrumbs">Workspace <span>/</span> {pageTitles[page]}</div>
            <h1>{pageTitles[page]}</h1>
          </div>
          <div className="header-actions">
            <button className="header-icon" onClick={() => navigate('notifications')} aria-label="Open notifications">
              <FiBell />
              {notifications.some((item) => !item.is_read) && <i />}
            </button>
            <div className="header-user"><div className="avatar small">{initials(user.name)}</div><span>{user.name}</span><FiChevronDown /></div>
          </div>
        </header>

        <main className="page-content">
          {error && <div className="alert-banner error-banner"><FiAlertCircle />{error}<button onClick={() => setError('')} aria-label="Dismiss"><FiX /></button></div>}
          {notice && <div className="alert-banner success-banner"><FiCheckCircle />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><FiX /></button></div>}

          {page === 'dashboard' && (
            <Dashboard
              user={user}
              tickets={tickets}
              analytics={analytics}
              onOpenTicket={openTicket}
              onNavigate={navigate}
            />
          )}
          {page === 'tickets' && (
            <TicketList
              user={user}
              tickets={tickets}
              onOpenTicket={openTicket}
              onRefresh={() => api.get('/tickets').then(({ data }) => setTickets(data.tickets || [])).catch((e) => setError(e.response?.data?.message || 'Unable to refresh tickets.'))}
            />
          )}
          {page === 'create' && isCustomer && (
            <CreateTicket
              categories={categories}
              onSubmit={async (formData) => {
                try {
                  const { data } = await api.post('/tickets', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                  })
                  showNotice(`Ticket ${data.ticket.ticket_number} created successfully.`)
                  setSelectedTicketId(data.ticket.id)
                  setPage('details')
                } catch (requestError) {
                  setError(requestError.response?.data?.message || 'Unable to create ticket.')
                }
              }}
              onSuggest={async (description) => {
                const { data } = await api.post('/portal/suggestions', { description })
                return data.suggestion
              }}
            />
          )}
          {page === 'details' && ticketDetails && (
            <TicketDetails
              data={ticketDetails}
              comments={comments}
              user={user}
              agents={team.filter((member) => member.role === 'agent' && member.is_active)}
              onBack={() => navigate('tickets')}
              onRefresh={() => setReloadVersion((version) => version + 1)}
              onUpdate={async (values) => {
                try {
                  const { data } = await api.put(`/tickets/${selectedTicketId}`, values)
                  setTicketDetails((current) => ({ ...current, ticket: data.ticket }))
                  setReloadVersion((version) => version + 1)
                  showNotice('Ticket updated.')
                } catch (requestError) {
                  setError(requestError.response?.data?.message || 'Unable to update ticket.')
                }
              }}
              onAssign={async (agentId) => {
                try {
                  await api.patch(`/tickets/${selectedTicketId}/assign`, { agent_id: Number(agentId) })
                  showNotice('Ticket assigned.')
                  setReloadVersion((version) => version + 1)
                } catch (requestError) {
                  setError(requestError.response?.data?.message || 'Unable to assign ticket.')
                }
              }}
              onConfirm={async (action) => {
                try {
                  const { data } = await api.patch(`/tickets/${selectedTicketId}/confirmation`, { action })
                  setTicketDetails((current) => ({ ...current, ticket: data.ticket }))
                  setReloadVersion((version) => version + 1)
                  showNotice(data.message)
                } catch (requestError) {
                  setError(requestError.response?.data?.message || 'Unable to update resolution.')
                }
              }}
              onComment={async (comment, isInternal) => {
                try {
                  await api.post(`/portal/tickets/${selectedTicketId}/comments`, {
                    comment,
                    is_internal: isInternal,
                  })
                  const { data } = await api.get(`/portal/tickets/${selectedTicketId}/comments`)
                  setComments(data.comments || [])
                } catch (requestError) {
                  setError(requestError.response?.data?.message || 'Unable to send reply.')
                }
              }}
              onEscalate={async (reason) => {
                try {
                  await api.post(`/portal/tickets/${selectedTicketId}/escalations`, { reason })
                  showNotice('Escalation submitted for review.')
                  setReloadVersion((version) => version + 1)
                } catch (requestError) {
                  setError(requestError.response?.data?.message || 'Unable to submit escalation.')
                }
              }}
              onReviewEscalation={async (escalationId, status) => {
                try {
                  await api.patch(`/portal/escalations/${escalationId}`, { status })
                  showNotice('Escalation status updated.')
                  setReloadVersion((version) => version + 1)
                } catch (requestError) {
                  setError(requestError.response?.data?.message || 'Unable to update escalation.')
                }
              }}
              onFeedback={async (rating, feedback) => {
                try {
                  await api.post(`/portal/tickets/${selectedTicketId}/feedback`, { rating, comments: feedback })
                  showNotice('Thank you for your feedback.')
                  setReloadVersion((version) => version + 1)
                } catch (requestError) {
                  setError(requestError.response?.data?.message || 'Unable to submit feedback.')
                }
              }}
              onDownload={async (attachment) => {
                try {
                  const { data } = await api.get(
                    `/tickets/${selectedTicketId}/attachments/${attachment.id}`,
                    { responseType: 'blob' },
                  )
                  const url = URL.createObjectURL(data)
                  const link = document.createElement('a')
                  link.href = url
                  link.download = attachment.file_name
                  link.click()
                  URL.revokeObjectURL(url)
                } catch (requestError) {
                  setError(requestError.response?.data?.message || 'Unable to download attachment.')
                }
              }}
            />
          )}
          {page === 'queue' && isAgent && (
            <AgentQueue
              tickets={queue}
              onOpenTicket={openTicket}
              onClaim={async (ticketId) => {
                try {
                  await api.post(`/portal/agent/queue/${ticketId}/claim`)
                  const { data } = await api.get('/portal/agent/queue')
                  setQueue(data.tickets || [])
                  showNotice('Ticket added to your queue.')
                } catch (requestError) {
                  setError(requestError.response?.data?.message || 'Unable to claim ticket.')
                }
              }}
            />
          )}
          {page === 'team' && canManage && (
            <TeamManagement
              users={team}
              isAdmin={isAdmin}
              onCreate={async (payload) => {
                try {
                  await api.post('/admin/users', payload)
                  const { data } = await api.get('/admin/users')
                  setTeam(data.users || [])
                  showNotice('Team member created.')
                } catch (requestError) {
                  setError(requestError.response?.data?.message || 'Unable to create team member.')
                }
              }}
              onToggle={async (member) => {
                try {
                  await api.patch(`/admin/users/${member.id}`, { is_active: !member.is_active })
                  const { data } = await api.get('/admin/users')
                  setTeam(data.users || [])
                  showNotice('Team member updated.')
                } catch (requestError) {
                  setError(requestError.response?.data?.message || 'Unable to update team member.')
                }
              }}
            />
          )}
          {page === 'reports' && canManage && <Reports reports={reports} />}
          {page === 'notifications' && (
            <Notifications
              items={notifications}
              onRead={async (id) => {
                try {
                  await api.patch(`/notifications/${id}/read`)
                  setNotifications((items) => items.map((item) => item.id === id ? { ...item, is_read: true } : item))
                } catch (requestError) {
                  setError(requestError.response?.data?.message || 'Unable to update notification.')
                }
              }}
              onReadAll={async () => {
                try {
                  await api.patch('/notifications/read-all')
                  setNotifications((items) => items.map((item) => ({ ...item, is_read: true })))
                  showNotice('All notifications marked as read.')
                } catch (requestError) {
                  setError(requestError.response?.data?.message || 'Unable to update notifications.')
                }
              }}
              onOpenTicket={(ticketId) => {
                if (ticketId) openTicket({ id: ticketId })
              }}
            />
          )}
          {page === 'security' && (
            <PasswordSettings
              user={user}
              form={passwordForm}
              busy={passwordBusy}
              onChange={(event) => setPasswordForm({ ...passwordForm, [event.target.name]: event.target.value })}
              onSubmit={submitPasswordChange}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function AuthScreen({ mode, form, error, message, busy, onChange, onSubmit, onModeChange }) {
  const isLogin = mode === 'login'
  const isRegister = mode === 'register'
  const isForgot = mode === 'forgot'
  const isReset = mode === 'reset'
  const heading = isLogin
    ? 'Sign in to your workspace'
    : isRegister
      ? 'Create your customer account'
      : isForgot
        ? 'Reset your password'
        : 'Choose a new password'
  const description = isLogin
    ? 'Your support requests and updates are right where you left them.'
    : isRegister
      ? 'Create an account to submit and track your support requests.'
      : isForgot
        ? 'We’ll email a secure reset link if an active account matches.'
        : 'Choose a new password to regain access to your account.'
  const buttonText = isLogin
    ? 'Sign in'
    : isRegister
      ? 'Create account'
      : isForgot
        ? 'Send reset link'
        : 'Reset password'

  return (
    <div className="auth-layout">
      <section className="auth-story">
        <div className="brand-lockup auth-brand">
          <div className="brand-symbol"><FiHeadphones /></div>
          <div><strong>SupportHub</strong><span>Customer care platform</span></div>
        </div>
        <div className="story-content">
          <span className="overline">SUPPORT, SIMPLIFIED</span>
          <h1>Every conversation deserves a thoughtful resolution.</h1>
          <p>One calm workspace to ask for help, keep track of progress, and make every customer feel heard.</p>
          <div className="story-metrics">
            <div><FiCheckCircle /><span>Clear updates</span></div>
            <div><FiShield /><span>Secure by design</span></div>
          </div>
        </div>
        <div className="story-footer">A better support experience, from first message to resolution.</div>
      </section>
      <section className="auth-panel">
        <div className="auth-card-v2">
          <span className="overline">{isLogin ? 'WELCOME BACK' : isRegister ? 'GET STARTED' : 'ACCOUNT RECOVERY'}</span>
          <h2>{heading}</h2>
          <p>{description}</p>
          {error && <div className="inline-error"><FiAlertCircle />{error}</div>}
          {message && <div className="auth-feedback" role="status">{message}</div>}
          <form onSubmit={onSubmit} className="auth-form">
            {isRegister && <label>Full name<input name="name" value={form.name} onChange={onChange} autoComplete="name" required minLength={2} maxLength={100} placeholder="Your name" /></label>}
            {!isReset && <label>Email address<input name="email" type="email" value={form.email} onChange={onChange} autoComplete="email" required placeholder="you@company.com" /></label>}
            {(isLogin || isRegister) && (
              <PasswordField
                label="Password"
                name="password"
                value={form.password}
                onChange={onChange}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                minLength={isRegister ? 12 : undefined}
                maxLength={isRegister ? 72 : undefined}
                placeholder={isLogin ? 'Enter your password' : 'At least 12 characters'}
              />
            )}
            {isReset && (
              <>
                <PasswordField label="New password" name="newPassword" value={form.newPassword} onChange={onChange} autoComplete="new-password" minLength={12} maxLength={72} placeholder="At least 12 characters" />
                <PasswordField label="Confirm new password" name="confirmPassword" value={form.confirmPassword} onChange={onChange} autoComplete="new-password" minLength={12} maxLength={72} placeholder="Re-enter your new password" />
              </>
            )}
            {isLogin && <div className="auth-forgot"><button type="button" onClick={() => onModeChange('forgot')}>Forgot password?</button></div>}
            <button className="button-primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : buttonText}<FiArrowUpRight /></button>
          </form>
          <div className="auth-toggle">
            {isLogin ? (
              <>New to SupportHub? <button type="button" onClick={() => onModeChange('register')}>Create account</button></>
            ) : isRegister ? (
              <>Already have an account? <button type="button" onClick={() => onModeChange('login')}>Sign in</button></>
            ) : (
              <>Remembered your password? <button type="button" onClick={() => onModeChange('login')}>Sign in</button></>
            )}
          </div>
          <div className="auth-secure"><FiShield /> Protected account access</div>
        </div>
      </section>
    </div>
  )
}

function PasswordField({ label, name, value, onChange, autoComplete, minLength, maxLength, placeholder }) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="password-field">
      {label}
      <span className="password-input-wrap">
        <input
          name={name}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={maxLength}
          required
          placeholder={placeholder}
        />
        <button
          className="password-visibility"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <FiEyeOff /> : <FiEye />}
        </button>
      </span>
    </label>
  )
}

function PasswordSettings({ user, form, busy, onChange, onSubmit }) {
  return (
    <section className="panel security-panel">
      <div className="panel-heading">
        <div>
          <h3>Change your password</h3>
          <p>Update credentials for {user.email}. Use at least 12 characters.</p>
        </div>
        <FiLock />
      </div>
      <form className="portal-form security-form" onSubmit={onSubmit}>
        <PasswordField label="Current password" name="currentPassword" value={form.currentPassword} onChange={onChange} autoComplete="current-password" placeholder="Enter your current password" />
        <PasswordField label="New password" name="newPassword" value={form.newPassword} onChange={onChange} autoComplete="new-password" minLength={12} maxLength={72} placeholder="At least 12 characters" />
        <PasswordField label="Confirm new password" name="confirmPassword" value={form.confirmPassword} onChange={onChange} autoComplete="new-password" minLength={12} maxLength={72} placeholder="Re-enter your new password" />
        <button className="button-primary" disabled={busy}><FiLock />{busy ? 'Updating…' : 'Change password'}</button>
      </form>
    </section>
  )
}

function Dashboard({ user, tickets, analytics, onOpenTicket, onNavigate }) {
  const stats = analytics?.stats || {}
  const recentTickets = [...tickets].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5)
  const message = user.role === 'customer'
    ? 'Track your requests and get the help you need.'
    : user.role === 'admin'
      ? 'Here is what is happening across your support operation.'
      : user.role === 'manager'
        ? 'Monitor team workload and keep service moving.'
        : 'Pick up where your customers need you most.'

  return (
    <>
      <section className="welcome-strip">
        <div><span className="overline">YOUR WORKSPACE</span><h2>Good to see you, {user.name?.split(' ')[0]}.</h2><p>{message}</p></div>
        {user.role === 'customer' && <button className="button-primary" onClick={() => onNavigate('create')}><FiPlus /> Create a ticket</button>}
        {user.role === 'agent' && <button className="button-primary" onClick={() => onNavigate('queue')}><FiFolder /> View ticket queue</button>}
      </section>
      <section className="metric-grid">
        <MetricCard label="Total tickets" value={stats.total ?? 0} icon={FiClipboard} tone="violet" />
        <MetricCard label="Open" value={stats.open ?? 0} icon={FiClock} tone="blue" />
        <MetricCard label="In progress" value={stats.in_progress ?? 0} icon={FiActivity} tone="amber" />
        <MetricCard label="Resolved" value={stats.resolved ?? 0} icon={FiCheckCircle} tone="green" />
      </section>
      <section className="dashboard-grid">
        <div className="panel chart-panel">
          <div className="panel-heading"><div><h3>Ticket activity</h3><p>New support requests over the last six months</p></div><span className="panel-icon"><FiActivity /></span></div>
          <div className="chart-area">
            {analytics?.monthlyTrend?.length
              ? <Suspense fallback={<div className="chart-loading">Preparing chart…</div>}><AnalyticsCharts variant="trend" data={analytics.monthlyTrend} /></Suspense>
              : <EmptyState title="No activity to chart yet" text="Ticket activity will appear here as requests come in." />}
          </div>
        </div>
        <div className="panel distribution-panel">
          <div className="panel-heading"><div><h3>Ticket status</h3><p>Current distribution</p></div></div>
          <div className="distribution-content">
            {analytics?.statusDistribution?.length
              ? <div className="donut-chart"><Suspense fallback={<div className="chart-loading">Preparing chart…</div>}><AnalyticsCharts variant="donut" data={analytics.statusDistribution} /></Suspense><span className="donut-total">{stats.total ?? 0}<small>tickets</small></span></div>
              : <div className="chart-empty"><FiClipboard /><span>No ticket data</span></div>}
            <div className="legend-list">{(analytics?.statusDistribution || []).map((item, index) => <div key={item.status}><i style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} /><span>{item.status}</span><strong>{item.count}</strong></div>)}</div>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h3>{user.role === 'customer' ? 'Your recent tickets' : 'Recent tickets'}</h3><p>Latest activity in your workspace</p></div><button className="button-quiet" onClick={() => onNavigate('tickets')}>View all <FiArrowUpRight /></button></div>
        <TicketTable tickets={recentTickets} user={user} onOpenTicket={onOpenTicket} />
      </section>
    </>
  )
}

function MetricCard({ label, value, icon: Icon, tone }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}><Icon /></span><div><span>{label}</span><strong>{value}</strong></div><span className="metric-trend"><FiArrowUpRight /></span></article>
}

function TicketList({ user, tickets, onOpenTicket, onRefresh }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All status')
  const filtered = useMemo(() => tickets.filter((ticket) => {
    const term = search.trim().toLowerCase()
    const matchesText = !term || `${ticket.ticket_number} ${ticket.subject} ${ticket.customer_name || ''} ${ticket.category_name || ''}`.toLowerCase().includes(term)
    return matchesText && (status === 'All status' || ticket.status === status)
  }), [tickets, search, status])
  return (
    <section className="panel workspace-panel">
      <div className="panel-heading"><div><h3>{user.role === 'customer' ? 'All your requests' : 'All support requests'}</h3><p>Search, review, and follow up on tickets.</p></div><button className="button-outline" onClick={onRefresh}><FiRefreshCw /> Refresh</button></div>
      <div className="table-controls"><label className="search-control"><FiSearch /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tickets…" /></label><select value={status} onChange={(event) => setStatus(event.target.value)}><option>All status</option>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></div>
      <TicketTable tickets={filtered} user={user} onOpenTicket={onOpenTicket} />
      <div className="table-footnote">Showing {filtered.length} of {tickets.length} tickets</div>
    </section>
  )
}

function TicketTable({ tickets, user, onOpenTicket }) {
  const isCustomer = user.role === 'customer'
  if (!tickets.length) return <EmptyState title="No tickets found" text={isCustomer ? 'When you submit a request, it will appear here.' : 'There are no tickets matching your current view.'} />
  return (
    <div className="table-scroll"><table className="data-table">
      <thead><tr><th>Ticket</th><th>Subject</th>{!isCustomer && <th>Customer</th>}<th>Category</th><th>Priority</th><th>Status</th><th>Created</th></tr></thead>
      <tbody>{tickets.map((ticket) => <tr key={ticket.id} onClick={() => onOpenTicket(ticket)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onOpenTicket(ticket)}>
        <td><span className="ticket-code">{ticket.ticket_number}</span></td>
        <td><strong className="table-subject">{ticket.subject}</strong></td>
        {!isCustomer && <td>{ticket.customer_name || '—'}</td>}
        <td>{ticket.category_name || 'Uncategorized'}</td>
        <td><PriorityBadge value={ticket.priority} /></td>
        <td><StatusBadge value={ticket.status} /></td>
        <td>{formatDate(ticket.created_at)}</td>
      </tr>)}</tbody>
    </table></div>
  )
}

function CreateTicket({ categories, onSubmit, onSuggest }) {
  const [form, setForm] = useState({ subject: '', description: '', category_id: '', priority: 'Medium' })
  const [files, setFiles] = useState([])
  const [suggestion, setSuggestion] = useState(null)
  const [busy, setBusy] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [localError, setLocalError] = useState('')

  async function getSuggestion() {
    setLocalError('')
    setSuggesting(true)
    try {
      const result = await onSuggest(form.description)
      setSuggestion(result)
      setForm((current) => ({
        ...current,
        category_id: result.category_id ? String(result.category_id) : current.category_id,
        priority: result.priority || current.priority,
      }))
    } catch (error) {
      setLocalError(error.response?.data?.message || 'Suggestion service is unavailable.')
    } finally {
      setSuggesting(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    setLocalError('')
    setBusy(true)
    const payload = new FormData()
    payload.append('subject', form.subject)
    payload.append('description', form.description)
    payload.append('category_id', form.category_id)
    payload.append('priority', form.priority)
    if (suggestion) {
      payload.append('ai_suggested_category', suggestion.category || '')
      payload.append('ai_suggested_priority', suggestion.priority || '')
    }
    files.forEach((file) => payload.append('attachments', file))
    try {
      await onSubmit(payload)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="form-layout">
      <section className="panel ticket-form-panel">
        <div className="panel-heading"><div><h3>Tell us what happened</h3><p>Share a few details so the right person can help.</p></div><span className="panel-icon"><FiFileText /></span></div>
        {localError && <div className="inline-error"><FiAlertCircle />{localError}</div>}
        <form onSubmit={submit} className="portal-form">
          <label>Subject<input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} maxLength={200} required placeholder="A short summary of the issue" /></label>
          <div className="form-row">
            <label>Category<select value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })} required><option value="">Choose a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label>Priority<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
          </div>
          <label>Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} minLength={5} maxLength={10000} rows={7} required placeholder="Describe the issue, what you expected, and any steps you have already tried." /></label>
          <div className="suggest-row"><button type="button" className="button-outline" onClick={getSuggestion} disabled={suggesting || form.description.trim().length < 5}><FiActivity />{suggesting ? 'Thinking…' : 'Suggest category & priority'}</button><span className="suggestion-note">Uses OpenAI when configured; otherwise suggestions stay local.</span>{suggestion && <span className="suggestion-note">Suggested {suggestion.category || 'category not clear'} · {suggestion.priority} priority · {suggestion.provider}</span>}</div>
          <label className="upload-field">Attachments <span>Up to 5 files, 5 MB each (PDF, image, text or DOCX)</span><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.gif,.txt,.docx" onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 5))} /></label>
          {files.length > 0 && <div className="file-chips">{files.map((file) => <span key={`${file.name}-${file.size}`}><FiFileText />{file.name}<button type="button" onClick={() => setFiles(files.filter((item) => item !== file))} aria-label={`Remove ${file.name}`}><FiX /></button></span>)}</div>}
          <div className="form-footer"><span>We’ll keep you updated as your request moves forward.</span><button className="button-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}<FiArrowUpRight /></button></div>
        </form>
      </section>
      <aside className="form-aside"><div className="aside-art"><span><FiHeadphones /></span><div className="art-line" /><div className="art-bubble">We’re on it</div></div><h3>What happens next?</h3><ol className="steps-list"><li><i>1</i><div><strong>We review your request</strong><span>Your ticket is routed to the right team.</span></div></li><li><i>2</i><div><strong>A specialist follows up</strong><span>Get updates and reply in one place.</span></div></li><li><i>3</i><div><strong>Confirm the resolution</strong><span>Close it when you’re happy with the outcome.</span></div></li></ol></aside>
    </div>
  )
}

function TicketDetails({ data, comments, user, agents, onBack, onRefresh, onUpdate, onAssign, onConfirm, onComment, onEscalate, onReviewEscalation, onFeedback, onDownload }) {
  const { ticket, history = [], attachments = [], escalations = [], feedback: submittedFeedback } = data
  const [reply, setReply] = useState('')
  const [internal, setInternal] = useState(false)
  const [escalation, setEscalation] = useState('')
  const [rating, setRating] = useState(5)
  const [feedback, setFeedback] = useState('')
  const canManage = ['admin', 'manager', 'agent'].includes(user.role)
  const canAssign = ['admin', 'manager'].includes(user.role)
  const isOwner = user.role === 'customer' && Number(ticket.user_id) === Number(user.id)
  const resolved = ticket.status === 'Resolved'
  const canRate = ['Resolved', 'Closed'].includes(ticket.status)

  return (
    <>
      <button className="back-link" onClick={onBack}><FiArrowDownLeft /> Back to tickets</button>
      <div className="detail-heading"><div><span className="ticket-code">{ticket.ticket_number}</span><h2>{ticket.subject}</h2><p>Created {formatDate(ticket.created_at)} by {ticket.customer_name || 'you'} · {ticket.category_name || 'Uncategorized'}</p></div><div className="detail-heading-actions"><button className="icon-button" onClick={onRefresh} title="Refresh ticket" aria-label="Refresh ticket"><FiRefreshCw /></button><StatusBadge value={ticket.status} /></div></div>
      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel">
            <div className="panel-heading"><div><h3>Request details</h3><p>Ticket description and current assignment</p></div><PriorityBadge value={ticket.priority} /></div>
            <p className="ticket-description">{ticket.description}</p>
            <div className="detail-meta"><span><small>ASSIGNED TO</small><strong>{ticket.agent_name || 'Unassigned'}</strong></span><span><small>LAST UPDATED</small><strong>{formatDate(ticket.updated_at)}</strong></span><span><small>RESOLVED</small><strong>{formatDate(ticket.resolved_at)}</strong></span></div>
            {canManage && ticket.status !== 'Closed' && (
              <div className="ticket-controls">
                <label>Status<select value={ticket.status} disabled={resolved} onChange={(event) => onUpdate({ status: event.target.value })}>{['Open', 'In Progress', 'Resolved'].map((status) => <option key={status}>{status}</option>)}</select></label>
                <label>Priority<select value={ticket.priority} onChange={(event) => onUpdate({ priority: event.target.value })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
                {canAssign && <label>Assign agent<select value={ticket.assigned_to || ''} onChange={(event) => event.target.value && onAssign(event.target.value)}><option value="">Choose agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>}
              </div>
            )}
            {isOwner && resolved && <div className="resolution-callout"><FiCheckCircle /><div><strong>Has your issue been resolved?</strong><span>Confirm to close the ticket, or reopen it if you still need help.</span></div><button className="button-outline" onClick={() => onConfirm('reopen')}>Reopen</button><button className="button-primary" onClick={() => onConfirm('close')}>Confirm resolution</button></div>}
          </section>
          <section className="panel conversation-panel">
            <div className="panel-heading"><div><h3>Conversation</h3><p>Keep all updates and replies together</p></div><span className="count-pill">{comments.length}</span></div>
            <div className="conversation-list">{comments.length ? comments.map((comment) => <article className={`comment ${comment.is_internal ? 'internal-comment' : ''}`} key={comment.id}><div className="avatar small">{initials(comment.author_name || user.name)}</div><div className="comment-body"><div className="comment-meta"><strong>{comment.author_name || 'Support team'}</strong><span>{comment.author_role && ROLE_LABELS[comment.author_role]} · {formatDate(comment.created_at)}</span>{comment.is_internal && <em>Internal note</em>}</div><p>{comment.comment}</p></div></article>) : <EmptyState title="No replies yet" text="Messages about this ticket will appear here." />}</div>
            {ticket.status !== 'Closed' && <form className="reply-form" onSubmit={(event) => { event.preventDefault(); if (reply.trim()) { onComment(reply, internal); setReply('') } }}><textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={3} placeholder={internal ? 'Write an internal note…' : 'Write a reply…'} required /><div className="reply-footer">{canManage && <label className="check-label"><input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} /> Internal note</label>}<button className="button-primary"><FiArrowUpRight /> Send reply</button></div></form>}
          </section>
          {isOwner && canRate && <section className="panel feedback-panel"><div className="panel-heading"><div><h3>{submittedFeedback ? 'Thank you for your feedback' : 'How did we do?'}</h3><p>{submittedFeedback ? `You rated this support experience ${submittedFeedback.rating} out of 5.` : 'Your feedback helps us improve support.'}</p></div><FiStar /></div>{!submittedFeedback && <><div className="rating-picker" role="radiogroup" aria-label="Rate your support experience">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} className={value <= rating ? 'selected' : ''} onClick={() => setRating(value)} aria-label={`${value} stars`}><FiStar /></button>)}</div><div className="feedback-row"><input value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={2000} placeholder="Anything else you would like us to know?" /><button className="button-outline" onClick={() => onFeedback(rating, feedback)}>Send feedback</button></div></>}</section>}
        </div>
        <aside className="detail-aside">
          <section className="panel"><div className="panel-heading"><div><h3>Attachments</h3><p>{attachments.length} files</p></div><FiFileText /></div>{attachments.length ? <div className="attachment-list">{attachments.map((file) => <button key={file.id} onClick={() => onDownload(file)}><span className="attachment-icon"><FiFileText /></span><span><strong>{file.file_name}</strong><small>{(Number(file.file_size) / 1024).toFixed(0)} KB</small></span><FiArrowUpRight /></button>)}</div> : <span className="muted-copy">No attachments on this ticket.</span>}</section>
          <section className="panel"><div className="panel-heading"><div><h3>Activity</h3><p>Recent ticket history</p></div><FiClock /></div>{history.length ? <div className="timeline">{history.slice(0, 8).map((item) => <div className="timeline-item" key={item.id}><i /><strong>{item.action}</strong><span>{item.changed_by_name || 'System'} · {formatDate(item.created_at)}</span>{item.new_value && <small>{item.new_value}</small>}</div>)}</div> : <span className="muted-copy">Activity will appear here.</span>}</section>
          {escalations.length > 0 && <section className="panel"><div className="panel-heading"><div><h3>Escalations</h3><p>Escalation review history</p></div><FiArrowUpRight /></div>{escalations.map((item) => <div className="escalation-item" key={item.id}><StatusBadge value={item.status} /><p>{item.reason}</p><small>{formatDate(item.created_at)}</small>{['admin', 'manager'].includes(user.role) && item.status === 'Pending' && <div className="escalation-actions"><button className="button-quiet" onClick={() => onReviewEscalation(item.id, 'Reviewed')}>Mark reviewed</button><button className="button-quiet" onClick={() => onReviewEscalation(item.id, 'Resolved')}>Resolve</button></div>}</div>)}</section>}
          {ticket.status !== 'Closed' && ticket.status !== 'Resolved' && <section className="panel escalation-panel"><div className="panel-heading"><div><h3>Need more attention?</h3><p>Request a review from a support manager.</p></div></div><textarea value={escalation} onChange={(event) => setEscalation(event.target.value)} rows={3} minLength={10} maxLength={1000} placeholder="Tell us why this should be escalated…" /><button className="button-outline full-width" disabled={escalation.trim().length < 10} onClick={() => { onEscalate(escalation); setEscalation('') }}>Submit escalation</button></section>}
        </aside>
      </div>
    </>
  )
}

function AgentQueue({ tickets, onOpenTicket, onClaim }) {
  return <section className="panel"><div className="panel-heading"><div><h3>Available to claim</h3><p>Unassigned tickets, ordered by urgency and waiting time.</p></div><span className="count-pill">{tickets.length} available</span></div>{tickets.length ? <div className="queue-list">{tickets.map((ticket) => <article className="queue-card" key={ticket.id}><button className="queue-main" onClick={() => onOpenTicket(ticket)}><span className="ticket-code">{ticket.ticket_number}</span><strong>{ticket.subject}</strong><span>{ticket.customer_name} · {ticket.category_name || 'Uncategorized'} · {formatDate(ticket.created_at)}</span></button><PriorityBadge value={ticket.priority} /><button className="button-primary" onClick={() => onClaim(ticket.id)}>Claim ticket</button></article>)}</div> : <EmptyState title="You’re all caught up" text="New unassigned tickets will appear here." />}</section>
}

function TeamManagement({ users, isAdmin, onCreate, onToggle }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'agent' })
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState('all')
  const visibleUsers = users.filter((member) => filter === 'all' || member.role === filter)
  async function submit(event) {
    event.preventDefault()
    setCreating(true)
    try {
      await onCreate(form)
      setForm({ name: '', email: '', password: '', role: 'agent' })
    } finally {
      setCreating(false)
    }
  }
  return (
    <div className="team-layout">
      <section className="panel"><div className="panel-heading"><div><h3>{isAdmin ? 'User & team management' : 'Support agents'}</h3><p>{isAdmin ? 'Manage customer access and support team accounts.' : 'Review the active support agent directory.'}</p></div>{isAdmin ? <select className="team-filter" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All roles</option><option value="customer">Customers</option><option value="agent">Agents</option><option value="manager">Managers</option></select> : <span className="count-pill">{visibleUsers.length} agents</span>}</div>
        <div className="team-list">{visibleUsers.map((member) => <article className="team-member" key={member.id}><div className="avatar">{initials(member.name)}</div><div className="team-member-copy"><strong>{member.name}</strong><span>{member.email}</span></div><span className={`role-pill role-${member.role}`}>{ROLE_LABELS[member.role] || member.role}</span><span className={`active-pill ${member.is_active ? 'enabled' : 'disabled'}`}>{member.is_active ? 'Active' : 'Inactive'}</span>{isAdmin && member.role !== 'admin' && <button className="button-quiet" onClick={() => onToggle(member)}>{member.is_active ? 'Deactivate' : 'Activate'}</button>}</article>)}</div>
        {!visibleUsers.length && <EmptyState title="No users in this view" text="Change the selected role or create a support team account." />}
      </section>
      {isAdmin && <section className="panel add-member-panel"><div className="panel-heading"><div><h3>Add a team member</h3><p>New team accounts require a strong password.</p></div><FiUsers /></div><form className="portal-form" onSubmit={submit}><label>Full name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} minLength={2} maxLength={100} required /></label><label>Email address<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label><PasswordField label="Temporary password" name="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" minLength={12} maxLength={72} placeholder="At least 12 characters" /><label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="agent">Support agent</option><option value="manager">Support manager</option></select></label><button className="button-primary" disabled={creating}><FiPlus />{creating ? 'Creating…' : 'Create account'}</button></form></section>}
    </div>
  )
}

function Reports({ reports }) {
  if (!reports) return <EmptyState title="Loading reports" text="Aggregating ticket activity…" />
  const resolution = reports.resolutionTime || {}
  return (
    <>
      <div className="report-intro"><div><span className="overline">SERVICE PERFORMANCE</span><h2>Support at a glance</h2><p>Understand workload, resolution speed, and customer demand.</p></div><span className="report-date"><FiClock /> Based on all tickets</span></div>
      <div className="metric-grid report-metrics"><MetricCard label="Resolved tickets" value={resolution.resolved_tickets ?? 0} icon={FiCheckCircle} tone="green" /><MetricCard label="Average resolution" value={`${resolution.average_hours ?? '—'} h`} icon={FiClock} tone="blue" /><MetricCard label="Fastest resolution" value={`${resolution.fastest_hours ?? '—'} h`} icon={FiArrowDownLeft} tone="violet" /><MetricCard label="Longest resolution" value={`${resolution.longest_hours ?? '—'} h`} icon={FiArrowUpRight} tone="amber" /></div>
      <div className="reports-grid">
        <ReportChart title="Ticket status report" description="Distribution by current status" data={reports.ticketStatus || []} dataKey="status" valueKey="count" />
        <ReportChart title="Ticket category report" description="Demand by ticket category" data={reports.ticketCategory || []} dataKey="category" valueKey="count" />
      </div>
      <section className="panel"><div className="panel-heading"><div><h3>Agent performance report</h3><p>Assigned workload and average resolution time by agent</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Agent</th><th>Assigned</th><th>Resolved</th><th>Avg. resolution</th></tr></thead><tbody>{(reports.agentPerformance || []).map((agent) => <tr key={agent.id}><td><strong>{agent.name}</strong></td><td>{agent.assigned}</td><td>{agent.resolved}</td><td>{agent.average_resolution_hours ?? '—'} hours</td></tr>)}</tbody></table></div></section>
    </>
  )
}

function ReportChart({ title, description, data, dataKey, valueKey }) {
  return <section className="panel report-chart"><div className="panel-heading"><div><h3>{title}</h3><p>{description}</p></div></div>{data.length ? <div className="report-chart-area"><Suspense fallback={<div className="chart-loading">Preparing chart…</div>}><AnalyticsCharts variant="report" data={data} dataKey={dataKey} valueKey={valueKey} /></Suspense></div> : <EmptyState title="No report data yet" text="Metrics will appear as tickets are created." />}</section>
}

function Notifications({ items, onRead, onReadAll, onOpenTicket }) {
  return <section className="panel"><div className="panel-heading"><div><h3>Your updates</h3><p>In-app updates about tickets and assignments.</p></div>{items.some((item) => !item.is_read) && <button className="button-outline" onClick={onReadAll}><FiCheck /> Mark all as read</button>}</div>{items.length ? <div className="notification-list">{items.map((item) => <article className={`notification-item ${item.is_read ? 'read' : 'unread'}`} key={item.id}><span className="notification-icon"><FiBell /></span><button className="notification-copy" onClick={() => item.ticket_id && onOpenTicket(item.ticket_id)}><strong>{item.title}</strong><span>{item.message}</span><small>{formatDate(item.created_at)}{item.ticket_id && ' · View ticket'}</small></button>{!item.is_read && <button className="mark-read" onClick={() => onRead(item.id)} title="Mark as read" aria-label="Mark as read"><FiCheck /></button>}</article>)}</div> : <EmptyState title="You’re all caught up" text="Important ticket updates will show up here." />}</section>
}

function StatusBadge({ value }) {
  return <span className={`status-badge status-${(value || '').toLowerCase().replace(/\s+/g, '-')}`}>{value || 'Unknown'}</span>
}

function PriorityBadge({ value }) {
  return <span className={`priority-badge priority-${(value || '').toLowerCase()}`}><i />{value || 'Medium'}</span>
}

function EmptyState({ title, text }) {
  return <div className="empty-state"><span><FiFolder /></span><strong>{title}</strong><p>{text}</p></div>
}

export default App
