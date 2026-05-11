export enum Role {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  USER = 'user',
}

/**
 * 📊 ALL SYSTEM AUDIT ACTIONS
 */
export enum TransactionAction {
  // 🔐 AUTH
  LOGIN = 'login',
  LOGOUT = 'logout',
  LOGIN_FAILED = 'login_failed',
  TOKEN_REFRESH = 'token_refresh',

  // 👤 USER MANAGEMENT
  CREATE_USER = 'create_user',
  DELETE_USER = 'delete_user',
  UPDATE_USER = 'update_user',
  CHANGE_PASSWORD = 'change_password',

  // 📁 FILE OPERATIONS
  UPLOAD = 'upload',
  DOWNLOAD = 'download',
  DELETE = 'delete',
  RESTORE = 'restore',
  RENAME_FILE = 'rename_file',
  MOVE_FILE = 'move_file',
  SHARE_FILE = 'share_file',
  UNSHARE_FILE = 'unshare_file',
  PERMANENT_DELETE = 'permanent_delete',
  VIEW_FILE = 'view_file', // ✅ NEW (preview tracking)

  // 📂 FOLDER OPERATIONS
  CREATE_FOLDER = 'create_folder',
  DELETE_FOLDER = 'delete_folder',
  MOVE_FOLDER = 'move_folder',

  // ☁️ UPLOAD SYSTEM (Multipart / R2 / S3)
  UPLOAD_FILE = 'upload_file',
  INIT_MULTIPART_UPLOAD = 'init_multipart_upload',
  COMPLETE_MULTIPART_UPLOAD = 'complete_multipart_upload',

  // 🔑 PASSWORD FLOW
  FORGOT_PASSWORD = 'forgot_password',
  RESET_PASSWORD = 'reset_password',

  // 🔐 OTP FLOW
  OTP_REQUEST = 'otp_request',
  OTP_RESEND = 'otp_resend',
  OTP_VERIFY = 'otp_verify', // ✅ IMPORTANT ADD
}

/**
 * 🎯 OTP PURPOSE (STRICTLY CONTROLLED)
 */
export enum OtpPurpose {
  RESET_PASSWORD = 'reset_password',
  DELETE_FILE = 'delete_file',
  CHANGE_EMAIL = 'change_email', // ✅ useful in real apps
  HIGH_RISK_ACTION = 'high_risk_action', // ✅ flexible future use
}