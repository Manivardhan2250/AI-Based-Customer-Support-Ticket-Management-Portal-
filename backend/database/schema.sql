-- ============================================
-- AI CUSTOMER SUPPORT TICKET MANAGEMENT PORTAL
-- PostgreSQL Database Schema
-- ============================================

-- 1. USERS
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'customer'
        CHECK (role IN (
            'admin',
            'customer',
            'agent',
            'manager'
        )),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. TICKET CATEGORIES
CREATE TABLE ticket_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

-- 3. TICKETS
CREATE TABLE tickets (
    id SERIAL PRIMARY KEY,
    ticket_number VARCHAR(30) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    category_id INTEGER REFERENCES ticket_categories(id),
    subject VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,

    priority VARCHAR(20) DEFAULT 'Medium'
        CHECK (priority IN (
            'Low', 'Medium', 'High', 'Critical'
        )),

    status VARCHAR(30) DEFAULT 'Open'
        CHECK (status IN (
            'Open',
            'In Progress',
            'Resolved',
            'Closed'
        )),

    assigned_to INTEGER REFERENCES users(id),
    ai_suggested_category VARCHAR(100),
    ai_suggested_priority VARCHAR(20),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    closed_at TIMESTAMP,
    customer_confirmed_at TIMESTAMP
);

-- 4. TICKET COMMENTS
CREATE TABLE ticket_comments (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL
        REFERENCES tickets(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    comment TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. TICKET ATTACHMENTS
CREATE TABLE ticket_attachments (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL
        REFERENCES tickets(id) ON DELETE CASCADE,
    uploaded_by INTEGER NOT NULL REFERENCES users(id),
    file_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    mime_type VARCHAR(100),
    file_size BIGINT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. TICKET ASSIGNMENTS
CREATE TABLE ticket_assignments (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL
        REFERENCES tickets(id) ON DELETE CASCADE,
    agent_id INTEGER NOT NULL REFERENCES users(id),
    assigned_by INTEGER NOT NULL REFERENCES users(id),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    unassigned_at TIMESTAMP
);

-- 7. TICKET HISTORY
CREATE TABLE ticket_history (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL
        REFERENCES tickets(id) ON DELETE CASCADE,
    changed_by INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. TICKET ESCALATIONS
CREATE TABLE ticket_escalations (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL
        REFERENCES tickets(id) ON DELETE CASCADE,
    escalated_by INTEGER NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    previous_priority VARCHAR(20),
    new_priority VARCHAR(20),
    status VARCHAR(20) DEFAULT 'Pending'
        CHECK (status IN (
            'Pending', 'Reviewed', 'Resolved'
        )),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. TICKET FEEDBACK
CREATE TABLE ticket_feedback (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER UNIQUE NOT NULL
        REFERENCES tickets(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INSERT DEFAULT TICKET CATEGORIES
-- ============================================

INSERT INTO ticket_categories (name, description)
VALUES
('Technical', 'Technical issues and software errors'),
('Billing', 'Payment, invoice and refund issues'),
('Account', 'Login, password and account problems'),
('Order', 'Order and delivery related issues'),
('General', 'General customer enquiries')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- DATABASE INDEXES
-- ============================================

CREATE INDEX idx_users_email ON users(email);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
    ON password_reset_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expiry
    ON password_reset_tokens(expires_at);

CREATE INDEX idx_tickets_user ON tickets(user_id);

CREATE INDEX idx_tickets_agent ON tickets(assigned_to);

CREATE INDEX idx_tickets_status ON tickets(status);

CREATE INDEX idx_tickets_priority ON tickets(priority);

CREATE INDEX idx_tickets_category ON tickets(category_id);

CREATE INDEX idx_tickets_created ON tickets(created_at);

CREATE INDEX idx_comments_ticket ON ticket_comments(ticket_id);

CREATE INDEX idx_history_ticket ON ticket_history(ticket_id);

CREATE INDEX idx_escalations_ticket ON ticket_escalations(ticket_id);

-- ============================================
-- END OF SCHEMA
-- ============================================