ArabGold CRM — Next.js 16 + Supabase + Tailwind 4。详细业务规则见 [`docs/业务规则.md`](docs/业务规则.md);上线前待办见 [`docs/上线前待办清单.md`](docs/上线前待办清单.md)。

## 开发模式说明

- **dev 首次启动需 20-30s**:Turbopack 冷启动正常现象,与生产无关(`npm run build` 出包 ~40s,运行时无影响)。
- **dev 偶发 `/customers/[id]/edit` 404**:Turbopack 增量编译偶发丢识别。处理方式:清 `.next` 重启 dev。生产构建(`npm run build && npm start`)不复现,已实测验证(2026-05-25)。

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
