# Bên Nhau ♥

App đếm ngày kỷ niệm cho hai người (giống Been Together), chạy trên **iPhone và Android**.
Viết bằng HTML/CSS/JS thuần: không framework, không cần build, không cài thư viện.

- Lưu nhiều kỷ niệm: ngày yêu nhau, ngày cưới, sinh nhật, lần đầu gặp, chuyến đi, tùy chỉnh.
- Mỗi kỷ niệm có kiểu đếm (đếm lên / đếm ngược / hằng năm), dòng chữ trên số ngày tự đặt (mặc định "Đã bên nhau", "Đã cưới được"…), bố cục ảnh (2 người, 1 ảnh, chia đôi, 3 ảnh, chỉ chữ), màu nền, ghi chú.
- Chọn 1 **kỷ niệm chính** hiện lớn ở trang chủ; mục **Sắp tới** nhắc các mốc 100 ngày, tròn năm, sinh nhật.
- Chạy được khi không có mạng. Dữ liệu luôn nằm đầy đủ trên máy.
- Đồng bộ giữa 2 máy qua **Google Sheet** của bạn (miễn phí), kèm **sao lưu ra file**.

---

## 1. Chạy thử trên máy tính

Cần Node.js. Trong thư mục này chạy:

```
npx serve .
```

Mở địa chỉ hiện ra (thường là http://localhost:3000). Bật chế độ điện thoại trong DevTools (F12) để xem giống trên điện thoại.

## 2. Đưa lên mạng (GitHub Pages, miễn phí)

App cần một địa chỉ **https** để cài lên điện thoại và chạy offline.

1. Tạo tài khoản GitHub, tạo repository mới (ví dụ `ben-nhau`, để **Public**).
2. Tải toàn bộ thư mục này lên repository (kéo thả trên web GitHub, hoặc dùng `git push`).
3. Vào **Settings → Pages** → Source: *Deploy from a branch* → chọn nhánh `main`, thư mục `/ (root)` → Save.
4. Sau 1–2 phút, app có địa chỉ dạng `https://<tên-github>.github.io/ben-nhau/`.

> Code không chứa dữ liệu hay mã bí mật nào nên để công khai được. Dữ liệu chỉ nằm trên điện thoại và trong Google Drive của bạn.
>
> **Giữ cố định địa chỉ này.** Dữ liệu trên máy gắn với địa chỉ web; đổi địa chỉ thì phải đồng bộ hoặc nhập sao lưu lại.

## 3. Cài lên điện thoại

- **iPhone:** mở địa chỉ trên bằng **Safari** → nút **Chia sẻ** → **Thêm vào MH chính**. Từ đó luôn mở app bằng biểu tượng trên màn hình chính.
  - Dữ liệu trong Safari và trong app ngoài màn hình chính là **riêng biệt**.
  - **Xóa biểu tượng app = xóa dữ liệu trên máy.** Dữ liệu vẫn lấy lại được từ Google Sheet hoặc file sao lưu.
- **Android:** mở bằng **Chrome** → menu **⋮** → **Cài đặt ứng dụng** (hoặc **Thêm vào màn hình chính**). App cũng tự hiện nút "Cài đặt" khi có thể.

## 4. Đồng bộ 2 máy qua Google Sheet

Chỉ **một người** cần làm phần này (khoảng 5 phút, nên làm trên máy tính).

1. Vào https://sheets.new để tạo một Google Sheet mới, đặt tên tùy ý (ví dụ "Bên Nhau").
2. Menu **Tiện ích mở rộng → Apps Script**. Xóa hết code mẫu, dán toàn bộ nội dung file [`apps-script/Code.gs`](apps-script/Code.gs), bấm **Lưu**.
3. Ở thanh công cụ, chọn hàm **`setup`** → bấm **Chạy**.
   - Google hỏi cấp quyền → chọn tài khoản của bạn.
   - Nếu hiện "Google chưa xác minh ứng dụng này": bấm **Nâng cao** → **Đi tới … (không an toàn)** → **Cho phép**. Đây là script của chính bạn nên an toàn.
   - Mở **Nhật ký thực thi** bên dưới, copy dòng **MÃ BÍ MẬT**.
4. Bấm **Triển khai → Tùy chọn triển khai mới** → biểu tượng bánh răng → **Ứng dụng web**:
   - *Thực thi với tư cách:* **Tôi**
   - *Người có quyền truy cập:* **Bất kỳ ai**
   - Bấm **Triển khai**, copy **URL ứng dụng web** (kết thúc bằng `/exec`).
5. Trên điện thoại của bạn: mở app → **Cài đặt** → dán URL vào ô "Mã mời hoặc URL Web App" → nhập **mã bí mật** → **Kết nối**.
6. Bấm **Gửi mã mời** để gửi mã cho người kia (qua Zalo, Messenger…). Người kia mở app → **Cài đặt** → dán mã → **Kết nối**. Xong!

Dữ liệu chữ nằm trong trang tính `memories`; ảnh nằm trong thư mục Drive `BenNhau-photos` (riêng tư, không chia sẻ link).
App tự đồng bộ khi mở app, khi quay lại app, sau mỗi lần lưu, và 5 phút một lần khi đang mở.

**Muốn thu hồi quyền** (ví dụ lộ mã mời): trong Apps Script chạy hàm `doiMaBiMat`, lấy mã mới trong nhật ký, rồi kết nối lại trên cả 2 máy.

**Sửa `Code.gs` về sau:** vào **Triển khai → Quản lý các lượt triển khai** → biểu tượng bút chì → *Phiên bản:* **Phiên bản mới** → **Triển khai**. Làm vậy để URL giữ nguyên.

## 5. Dữ liệu được bảo vệ thế nào

| Lớp | Ở đâu | Ghi chú |
|---|---|---|
| 1 | Trên **mỗi điện thoại** (IndexedDB) | Bản đầy đủ, app chạy cả khi không có mạng |
| 2 | **Google Sheet + Drive** | Có lịch sử phiên bản (Sheet) và thùng rác 30 ngày (Drive) |
| 3 | **File sao lưu** (Cài đặt → Xuất file) | 1 file `.json` gồm cả ảnh; cất vào Drive, Zalo, máy tính… |

- **Cloud bị mất hoặc bị xóa** (xóa dòng, xóa trang tính, xóa thư mục ảnh): dữ liệu trên máy **không bị ảnh hưởng**. Lần đồng bộ sau, máy tự đẩy lại phần thiếu lên cloud.
- Chỉ thao tác **Xóa** trong app mới lan sang máy kia, và kỷ niệm bị xóa nằm trong **Thùng rác 30 ngày** (Cài đặt → Thùng rác) để khôi phục.
- Hai người cùng sửa một kỷ niệm: bản sửa **sau cùng** được giữ.
- Mất cả file Google Sheet: làm lại bước 4 (Sheet mới + script mới), kết nối lại cả 2 máy. Máy sẽ tự đẩy toàn bộ dữ liệu lên Sheet mới.

## 6. Cập nhật app

Mỗi lần sửa code: tăng `VERSION` trong **`sw.js`** và **`js/app.js`** rồi đưa lên GitHub. Lần mở app kế tiếp sẽ hiện "Đã có bản cập nhật mới → Tải lại".

Nếu bản cập nhật có sửa **`apps-script/Code.gs`** (ví dụ bản 1.1.0 thêm cột `label`) và bạn **đã cài Apps Script trước đó**: dán lại toàn bộ `Code.gs` → **Lưu** → **Triển khai → Quản lý các lượt triển khai** → bút chì → *Phiên bản:* **Phiên bản mới** → **Triển khai**. Chưa cập nhật thì app vẫn chạy bình thường, chỉ là dòng chữ tự đặt chưa được đồng bộ sang máy kia.

## 7. Cấu trúc thư mục

```
index.html            khung app
app.css               giao diện (có chế độ tối, vùng tai thỏ iPhone)
manifest.webmanifest  tên, icon, chạy toàn màn hình
sw.js                 service worker: chạy offline
icons/                icon app
js/app.js             khởi động, điều hướng, màn hình chính / chi tiết / cài đặt
js/editor.js          màn tạo / sửa kỷ niệm, kéo / zoom ảnh
js/render.js          vẽ thẻ kỷ niệm theo bố cục, danh sách, "Sắp tới"
js/model.js           cấu trúc kỷ niệm, danh sách loại & bố cục
js/dates.js           tính ngày, năm / tháng / ngày, hằng năm (29/2 → 28/2)
js/db.js              lưu trên máy (IndexedDB)
js/photos.js          nén ảnh, ảnh nhỏ, đọc / ghi ảnh
js/sync.js            đồng bộ Google Sheet, tự phục hồi
js/backup.js          xuất / nhập file sao lưu
apps-script/Code.gs   API chạy trên Google Apps Script
```

**Thêm loại kỷ niệm hoặc bố cục mới:** thêm 1 mục vào `TYPES` hoặc `LAYOUTS` trong `js/model.js`.

## Giới hạn

- Không ghim được lên màn hình khóa / widget (web app không làm được việc này).
- Không có thông báo nhắc theo lịch; thay vào đó xem mục **Sắp tới** trong app.
- Ảnh HEIC trên một số máy Android không đọc được; hãy chọn ảnh JPG/PNG. iPhone tự đổi HEIC sang JPG.
