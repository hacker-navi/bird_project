const express = require('express');
const { User } = require('../db/models');
const { hash, verify } = require('../db/simpleHash');
const { audit } = require('../services/pipeline');
const router = express.Router();

// NOTE: This demo issues a simple opaque token (the user's Mongo _id) instead
// of a real JWT/session store, to keep the prototype dependency-free. Swap for
// signed JWTs + refresh tokens before internet-facing production use.

router.post('/auth/register', async (req, res) => {
  const { name, email, password, role = 'CITIZEN', phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  const validRoles = ['ADMIN', 'GOVERNMENT', 'FIELD_AGENT', 'CITIZEN'];
  if (!validRoles.includes(role)) return res.status(400).json({ error: `role must be one of ${validRoles.join(', ')}` });

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const user = await User.create({ name, email, password_hash: hash(password), role, phone: phone || null });
  await audit('USER_REGISTERED', 'user', { id: user._id.toString(), email, role });
  res.status(201).json({ token: user._id.toString(), user: { id: user._id.toString(), name, email, role } });
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: (email || '').toLowerCase() });
  if (!user || !verify(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });

  await audit('USER_LOGIN', 'user', { id: user._id.toString(), email }, user._id);
  res.json({
    token: user._id.toString(),
    user: {
      id: user._id.toString(), name: user.name, email: user.email, role: user.role,
      agent_status: user.agent_status, home_risk_zone: user.home_risk_zone
    }
  });
});

router.post('/auth/logout', (req, res) => res.json({ ok: true }));

router.get('/auth/profile', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  const user = await User.findById(token).select('name email role phone agent_status home_risk_zone');
  if (!user) return res.status(401).json({ error: 'Invalid token' });
  res.json(user.toJSON());
});

module.exports = router;
