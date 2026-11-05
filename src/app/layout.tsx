import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"PARTY POINT - 생일파티 게임",description:"친구들과 함께하는 실시간 포인트 파티 게임"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
