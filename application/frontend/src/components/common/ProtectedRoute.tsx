
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  // 인증 체크 우회 - 바로 접근 허용
  return <>{children}</>;
}
