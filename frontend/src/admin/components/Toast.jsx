import React from 'react';

export default function AdminToast({ toast }) {
  if (!toast?.visible) return null;
  return (
    <div className={`ap-toast ap-toast-${toast.tone || 'ok'}`}>
      {toast.message}
    </div>
  );
}
