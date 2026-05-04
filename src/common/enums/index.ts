export enum Role {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  USER = 'user',
}

export enum TransactionAction {
  UPLOAD = 'upload',
  DOWNLOAD = 'download',
  DELETE = 'delete',
  RESTORE = 'restore',

  CREATE_FOLDER = 'create_folder',
  DELETE_FOLDER = 'delete_folder',
  MOVE_FOLDER = 'move_folder',

  LOGIN = 'login',

  CREATE_USER = 'create_user',
  DELETE_USER = 'delete_user',
  UPDATE_USER = 'update_user',
  CHANGE_PASSWORD = 'change_password',

  RENAME_FILE = 'rename_file',
  SHARE_FILE = 'share_file',
  UNSHARE_FILE = 'unshare_file',
  MOVE_FILE = 'move_file',

  PERMANENT_DELETE = 'permanent_delete',

  // OTP
  OTP_REQUEST = 'otp_request',
  OTP_RESEND = 'otp_resend',

  // Upload system (R2 / multipart)
  UPLOAD_FILE = 'upload_file',
  INIT_MULTIPART_UPLOAD = 'init_multipart_upload',
  COMPLETE_MULTIPART_UPLOAD = 'complete_multipart_upload',

  FORGOT_PASSWORD = 'forgot_password',
  RESET_PASSWORD = 'reset_password',
}

export enum OtpPurpose {
  LOGIN = 'login',
  DELETE_FILE = 'delete_file',
  RESET_PASSWORD = 'reset_password',
}
