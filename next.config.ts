import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // صفحة الدخول لا تُخزَّن مؤقتاً أبداً — نمنع ظهور نسخة قديمة من خادم متوقف
        source: "/login",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
