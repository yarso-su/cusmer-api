CREATE TABLE roles_user(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(LENGTH(name) <= 20)
);
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE users(
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL CHECK(LENGTH(name) <= 60),
  role INTEGER NOT NULL REFERENCES roles_user(id),
  email TEXT NOT NULL UNIQUE CHECK(LENGTH(email) <= 80),
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK(email_verified IN (0, 1)),
  password_hash TEXT NOT NULL CHECK(LENGTH(password_hash) <= 255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1))
);
CREATE TABLE user_consents(
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES users(id),
  terms_v TEXT NOT NULL CHECK(LENGTH(terms_v) <= 48),
  terms_hash TEXT NOT NULL,
  policies_v TEXT NOT NULL CHECK(LENGTH(policies_v) <= 48),
  policies_hash TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  accepted_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE user_keys(
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES users(id),
  key TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE user_secrets(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL CHECK(LENGTH(label) <= 60),
  key TEXT NOT NULL,
  content TEXT NOT NULL,
  iv TEXT NOT NULL CHECK(LENGTH(iv) = 16),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  receiver_id TEXT NOT NULL REFERENCES users(id)
);
CREATE TABLE user_factura(
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES users(id),
  factura_client_id TEXT NOT NULL CHECK(LENGTH(factura_client_id) <= 255),
  is_foreign INTEGER NOT NULL CHECK(is_foreign IN (0, 1)),
  cfdi_use TEXT NOT NULL DEFAULT 'G03' CHECK(LENGTH(cfdi_use) = 3)
);
CREATE TABLE user_foreign(
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES users(id)
);
CREATE TABLE user_stripe_customer(
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES users(id),
  stripe_customer_id TEXT NOT NULL CHECK(LENGTH(stripe_customer_id) <= 255)
);
CREATE TABLE user_company(
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL CHECK(LENGTH(company) <= 80)
);
CREATE TABLE sessions(
  id TEXT NOT NULL PRIMARY KEY,
  verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0, 1)),
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE session_code(
  id TEXT NOT NULL PRIMARY KEY,
  code TEXT NOT NULL CHECK(LENGTH(code) = 6),
  session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE statuses_service(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT CHECK(LENGTH(name) <= 40)
);
CREATE TABLE services(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(LENGTH(name) <= 60),
  description TEXT NOT NULL CHECK(LENGTH(description) <= 240),
  tag TEXT NOT NULL CHECK(LENGTH(tag) <= 60),
  status INTEGER NOT NULL REFERENCES statuses_service(id) DEFAULT 1,
  duration_weeks INTEGER NOT NULL,
  payment_installments INTEGER NOT NULL,
  is_recurring INTEGER NOT NULL DEFAULT 0 CHECK(is_recurring IN (0, 1)),
  portfolio_consent INTEGER NOT NULL CHECK(portfolio_consent IN (0, 1)),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE payment_intents(
  service_id INTEGER NOT NULL PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
  stripe_id TEXT NOT NULL UNIQUE CHECK(LENGTH(stripe_id) <= 255),
  applied_discount INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE service_discount(
  service_id INTEGER NOT NULL PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
  percentage INTEGER NOT NULL,
  description TEXT NOT NULL CHECK(LENGTH(description) <= 80),
  disposable INTEGER NOT NULL DEFAULT 1 CHECK(disposable IN (0, 1)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE pending_charges(
  service_id INTEGER NOT NULL PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
  attempt_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE types_service_item(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ps_key TEXT NOT NULL CHECK(LENGTH(ps_key) = 8),
  name TEXT NOT NULL CHECK(LENGTH(name) <= 60)
);
CREATE TABLE service_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(LENGTH(name) <= 60),
  description TEXT NOT NULL CHECK(LENGTH(description) <= 240),
  type INTEGER NOT NULL REFERENCES types_service_item(id),
  cost INTEGER NOT NULL,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE
);
CREATE TABLE service_logger_key(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL REFERENCES services(id) UNIQUE
);
CREATE TABLE service_logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL REFERENCES services(id),
  origin TEXT NOT NULL CHECK(LENGTH(origin) <= 255),
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE payments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount REAL NOT NULL, -- Using REAL instead of NUMERIC(9,3)
  applied_discount INTEGER NOT NULL,
  service_id INTEGER NOT NULL REFERENCES services(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
, means text not null check(means in ('03', '04', '28', '99')) default '99');
CREATE TABLE payment_factura(
  payment_id INTEGER NOT NULL PRIMARY KEY REFERENCES payments(id),
  factura_invoice_id TEXT NOT NULL CHECK(LENGTH(factura_invoice_id) <= 255)
);
CREATE TABLE types_thread(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT CHECK(LENGTH(name) <= 40)
);
CREATE TABLE statuses_thread(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT CHECK(LENGTH(name) <= 40)
);
CREATE TABLE threads(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(LENGTH(name) <= 60),
  type INTEGER NOT NULL REFERENCES types_thread(id),
  status INTEGER NOT NULL REFERENCES statuses_thread(id) DEFAULT 1,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE thread_service(
  thread_id INTEGER NOT NULL PRIMARY KEY REFERENCES threads(id),
  service_id INTEGER NOT NULL REFERENCES services(id)
);
CREATE TABLE thread_messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL CHECK(LENGTH(content) <= 240),
  thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE pending_invoices(
  payment_id INTEGER NOT NULL PRIMARY KEY REFERENCES payments(id)
);
CREATE TABLE taxes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount REAL NOT NULL
);
CREATE TABLE operating_costs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount REAL NOT NULL,
  note TEXT NOT NULL CHECK(LENGTH(note) <= 140)
);
CREATE TABLE internal_logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origin TEXT NOT NULL CHECK(LENGTH(origin) <= 255),
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_services_user_id ON services(user_id);
CREATE INDEX idx_services_status ON services(status);
CREATE INDEX idx_service_items_service_id ON service_items(service_id);
CREATE INDEX idx_service_logs_service_id ON service_logs(service_id);
CREATE INDEX idx_payments_service_id ON payments(service_id);
CREATE INDEX idx_threads_user_id ON threads(user_id);
CREATE INDEX idx_thread_messages_thread_id ON thread_messages(thread_id);
CREATE INDEX idx_thread_messages_user_id ON thread_messages(user_id);
CREATE TRIGGER update_user_secrets_updated_at
    AFTER UPDATE ON user_secrets
    BEGIN
        UPDATE user_secrets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
CREATE TABLE service_contract(
  service_id INTEGER NOT NULL PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK(LENGTH(content) >= 8)
);
CREATE TABLE test(
  name text not null,
  active integer not null default 1 check(active in (0, 1))
);
CREATE TABLE service_payment_method(
  service_id INTEGER NOT NULL PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
  stripe_id TEXT NOT NULL
);
CREATE TABLE pending_global_invoices(
  payment_id INTEGER NOT NULL PRIMARY KEY REFERENCES payments(id)
);
CREATE TABLE thread_attachments(
  filename TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id INTEGER NOT NULL REFERENCES threads (id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX idx_thread_attachments_thread_created ON thread_attachments(thread_id, created_at);
