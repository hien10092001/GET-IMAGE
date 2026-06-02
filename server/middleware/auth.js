import 'dotenv/config'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_this'

export function generateToken(user) {
  return jwt.sign(
    { id: user._id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  )
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Không có quyền truy cập' })
  }
  try {
    const decoded = verifyToken(header.split(' ')[1])
    req.user = decoded
    next()
  } catch {
    res.status(401).json({ message: 'Token không hợp lệ' })
  }
}

export function roleMiddleware(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Không đủ quyền' })
    }
    next()
  }
}
