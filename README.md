# My Wealth V1.0 — Myportfolio 完整重製
本專案沿用原本 GitHub Pages 的網址，但改成全新私人資產儀表板。

## 目前可用
- iPhone／Mac 響應式介面與五個功能頁籤
- 國泰世華／國泰證券／元大證券／Firstrade 等資產分帳戶管理
- 台股與美股、TWD／USD 現金及參考匯率
- 單筆持股／現金新增、覆蓋、刪除
- 每日資產快照、JSON 下載與匯入
- 舊版 Myportfolio 本機 pt_stocks / pt_banks 單向複製
- Firebase 設定完成後，Google 登入 + Firestore 存檔讀取

## 目前沒有
- **尚未**連接國泰、元大、Firstrade 官方帳戶；未支援原始券商 CSV/PDF
- **尚未**實作自動股票報價與每日伺服器排程
- Firestore 尚未在你的 Firebase Console 建立及配置
- 尚未做多裝置同時寫入衝突合併；請勿兩台同時修改
- 初次部署預設是本機模式，無法跨 iPhone／Mac 自動同步

## 正式啟用 Firestore
1. 到 https://console.firebase.google.com 建立 Firebase 專案。
2. Authentication > Sign-in method > 啟用 Google。
3. 建立 Firestore Database（正式模式）；複製 `firestore.rules` 到規則面板並 Publish。
4. Firebase 專案設定 > Your apps > Web App 取得 config，填到 `firebase-config.js`。API key 可以在前端公開，但不要在 GitHub 放入 service account JSON、銀行密碼、API secret 或私鑰。
5. Authentication > Settings > Authorized domains 加入 `wshung000-pixel.github.io`。
6. 使用瀏覽器登入，首次同步要確認保留本機資料或採用雲端資料。
7. 正式存入金融資料前，建議將 Firestore Rules 改為你的專用 UID 白名單。

## 舊資料保存
舊版資料存在每台裝置瀏覽器 localStorage 的 `pt_stocks`、`pt_banks` 等鍵值。
新 App 使用獨立的 `mw_v1_data`，不會清除舊資料；但舊版與新版資料不會自動互相更新。
原本程式碼另已保存於 `backup/pre-my-wealth-rebuild-20261022` Git 分支。
**GitHub 程式備份不等於瀏覽器資產備份。** 發布前請使用舊版網站的「匯出備份」下載 JSON。
新 App 的「從舊 Myportfolio 匯入」只涵蓋庫存與現金帳戶，不轉入舊損益交易及歷史圖表；舊資料務必另存備份。

## GitHub Pages
Repository Settings > Pages 應設定 Deploy from branch = main / root。
此功能目前在新開發分支中；待 PR 合併 main 才會替換正式網站。
如手機看見舊版，請關閉 Safari 已開啟分頁重開；service worker cache 已改版。

## 安全提醒
本專案含手動紀錄的私人資產資料；不能以 GitHub Pages 本身作為資料保護。
Firebase Firestore 必須啟用 Authentication 與嚴格 Security Rules。
本機 localStorage 的內容可由使用該裝置／瀏覽器的人存取，請使用裝置鎖定。
