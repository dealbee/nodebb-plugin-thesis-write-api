# Plugin cung cấp api cho NodeBB (Luận văn CNTN 2016 - HCMUS)

Plugin được chỉnh sửa dựa trên source code gốc của [nodebb-plugin-write-api](https://github.com/NodeBB/nodebb-plugin-write-api)
Plugin cung cấp các REST api để thao tác lên cơ sở dữ liệu của server chạy NodeBB

## Cài đặt

1. Mở command line ở thư mục chứa source code của compser này và chạy lệnh `npm link`
2. Mở command line ở thư mục chứa source code của NodeBB và chạy lệnh `npm link nodebb-plugin-thesis-write-api`
3. Vào trang admin của NodeBB */admin/extend/plugins*:
* Tìm và deactivate plugin *nodebb-plugin-write-api* (nếu có)
* Tìm và activate plugin *nodebb-plugin-thesis-write-api*
4. Rebuild và restart NodeBB

## Chứng thực

Chứng thực được xử lý thông qua cả HTTP Bearer hoặc là JSON Web Token

### Bearer Tokens

Có hai loại tokens
  *user token* liên hệ trực tiếp đến uid của người dùng được cấp cho token (thông qua trang admin của plugin này), mọi thao tác đều thực hiện trên danh nghĩa username của người dùng này
  *master token* không liên hệ phụ thuộc với bất kỳ người dùng nào, vì vậy cần truyền tham số `_uid` trong request gửi lên server, sau đó các thao tác sẽ được thực hiện dưới *tên* của người dùng này.
   Đây là khác biệt cơ bản giữa 2 loại tokens. Những *master token* nếu chứa tham số `_uid` chưa được trao quyền admin sẽ không thực hiện được các thao tác cần quyền admin này.

*Chú ý*: *user token* có thể được tạo thông qua trang administration(`admin/plugins/thesis-write-api`), or via the token generation route (`POST /api/v1/users/{UID}/tokens`) bằng cách gửi kèm *password*, thêm vào đó *user tokens* có thể được tạo từ những master token đã có sẵn.

### JSON Web Tokens

Để thực hiện request với JSON Web Token thay vì user/master token, thêm vào request payload với biến `secret` như được định nghĩa ở trang admin của plugin, ngoài ra cũng phải gửi kèm nó trong POST body, hoặc trong query string parameter. Ở cả hai trường hợp, key `token` đều được sử dụng.

Ví dụ

``` bash
$ curl http://localhost:4567/api/v1/users/1/tokens?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfdWlkIjoxfQ.pbm5wbAZ4__yFh5y8oeCsJyT0dm8ROcd5SEBr4yGlNw  # secret là 'secret'
```

## Error Handling

Khi API gặp lỗi, chương trình sẽ báo lỗi. Các lỗi sẽ được báo thông qua format bên dưới:

    {
        "code": "not-authorised",
        "message": "You are not authorised to make this call",
        "params": {}
    }
## `api/dealbee` Endpoints

* `/api/dealbee`
    * `/users`
        * `POST /login`
            * Đăng nhập
            * **Requires**: `username`, `password`
            * **Response**: cookies được gắn ở header, và [các thông tin](./asset/dataUserLogin.json) của người dùng
        * `GET /:uid`
            * Lấy thông tin của người dùng
            * **Response**: [các thông tin](./asset/dataUser.json) của người dùng
        * `GET /:uid/topics`
            * Lấy thông tin các topics thuộc về `uid`
            * Trả về thông tin các topic
            * **Accepts**: `limit`, `offset`
            * **Response**: [Các thông tin chi tiết](./asset/dataUserTopics.json) của các bài đăng ở dạng array object JSON
        * `POST /`
            * Tạo người dùng mới
            * **Requires**: `username`
            * **Accepts**: `password`, `email`
            * Các dữ liệu khác sẽ được lưu trong user hash
        * `PUT /:uid`
            * Cập nhật thông tin người dùng
            * **Accepts**: `username`, `email`, `fullname`, `website`, `location`, `birthday`, `signature`
            * Các giá trị khác được pass vào thông qua the `action:user.updateProfile` hook đều được chấp nhận
            * `uid` có thể không cần thiết trong request body. Không có nó, profile của người dùng đang được gọi sẽ được cập nhật.
        * `DELETE /:uid`
            * Xóa người dùng NodeBB (**Cẩn trọng**: Không có thông báo để yêu cầu xác nhận lại khi đã xóa!)
            * **Accepts**: No parameters
            * Người dùng có thể tự xóa mình, hoặc từ admin
        * `PUT /:uid/password`
            * Đổi user password
            * **Requires**: `uid`, `new`
            * **Accepts**: `current`
            * `current` cần phải có nếu người dùng gọi requets này không phải là administrator
        * `POST /:uid/follow`
            * Follows người dùng mới
            * **Accepts**: No parameters
        * `DELETE /:uid/follow`
            * Unfollows người dùng
            * **Accepts**: No parameters
        * `POST /:uid/chats`
            * Chat với user khác
            * **Requires**: `message`
            * **Accepts**: `timestamp`, `quiet`
            * `timestamp` (unix timestamp in ms) cho phép các tin nhắn được gửi từ quá khứ (tiện dụng để import chat)
            * `quiet` nếu được set, sẽ không thông báo đến người dùng nếu tin nhắn đến (sử dụng khi import chat)
        * `POST /:uid/ban`
            * Bans user
        * `DELETE /:uid/ban`
            * Unbans user
        * `GET /:uid/tokens`
            * Trả về các active tokens cho người dùng này
            * **Accepts**: No parameters
        * `POST /:uid/tokens`
            * Tạo token cho người dùng thông qua uid được truyền vào
            * **Accepts**: No parameters normally, will accept `password` in lieu of Bearer token
            * Có thể được gọi với active token cho user này
            * Đây là route duy nhất cho phép pass in `password` trong request body. Tạo một token mới và sử dụng token đó trong những lần gọi sau.
        * `DELETE /:uid/tokens/:token`
            *Xóa token tương ứng của người dùng
            * **Accepts**: No parameters
    * `/categories`
        * `GET /`
            * Lấy danh sách tất cả categories
        * `POST /`
            * Tạo mới một category
            * **Requires**: `name`
            * **Accepts**: `description`, `bgColor`, `color`, `parentCid`, `class`
        * `PUT /:cid`
            * Cập nhật dữ liệu của category
            * **Accepts**: `name`, `description`, `bgColor`, `color`, `parentCid`
        * `DELETE /:cid`
            * Xóa hẳn một category, bao gồm các topics và posts bên trong.(**Cẩn trọng**: Không có các thông báo xác nhận!)
            * **Accepts**: No parameters
        * `PUT /:cid/state`
            * Enables category
            * **Accepts**: No parameters
        * `DELETE /:cid/state`
            * Disables category
            * **Accepts**: No parameters
    * `/groups`
        * `POST /`
            * Tạo một group mới
            * **Requires**: `name`
            * **Accepts**: `description`, `hidden`, `private`, `ownerUid`
        * `DELETE /:slug`
            * Xóa một group (**Cẩn trọng**: Không có các thông báo xác nhận!)
            * **Accepts**: No parameters
        * `POST /:slug/membership`
            * Tham gia một group (hoặc requests membership nếu nó là private group)
            * **Accepts**: No parameters
        * `DELETE /:slug/membership`
            * Rời group
            * **Accepts**: No parameters
    * `/topics`
        * `GET /`
            * Lấy thông tin tất cả topic
            * **Accepts**:
             * `sorted` phương thức sort, bao gồm:
                * TIME_ASC (default),
                * TIME_DESC,
                * VIEW_ASC,
                * VIEW_DESC,
                * UPVOTE_ASC,
                * UPVOTE_DESC,
                * COMMENT_ASC,
                * COMMENT_DESC,
                * DISCOUNT_MONEY_ASC (cần thêm `currency`: [currency](./lib/currency.json)),
                * DISCOUNT_MONEY_DESC (cần thêm `currency`: [currency](./lib/currency.json)),
                * TIME_LEFT_DESC áp dụng cho flashdeal
                * TIME_LEFT_ASC áp dụng cho flashdeal
             * `cid` id của chủ đề cần lọc
             * `flashdeal` chỉ lấy flashdeal trong vòng 24H (`true` hay `false`)
             * `limit` đi kèm cùng `offset` để phân trang
            * **Response**: [Các thông tin chi tiết](./asset/dataTopics.json) của các bài đăng ở dạng array object JSON
        * `GET /:tid`
            * Lấy thông tin cuả topic có `tid`
            * **Response**: Thông tin chi tiết của topic có `tid`, bao gồm thông tin chi tiết của main post, chứa ở trường `mainPost`
        * `GET /:tid/posts`
            * Ví dụ: `../topics/1/posts?limit=2&offset=1`
            * Lấy thông tin các comments (posts) của một topic (**không bao gồm main post**)
            * **Accepts**: `limit` (default 5), `offset`
            * **Response**: [Các thông tin chi tiết](./asset/dataComments.json) của các posts trong topic (**không bao gồm main post**)
        * `POST /`
            * Tạo topic
            * **Requires**: `cid`, `title`, `content`, `_uid` của người tạo
            * **Accepts**:
                * `tags (array)`, 
                * `amount` kiểu int,
                * `brand`,
                * `coupon`,
                * `currency` phải [hợp lệ](./lib/currency.json),
                * `dealUrl`,
                * `price` kiểu float,
                * `discountPercentage` kiểu float <=100,
                * `discountPrice` kiểu float,
                * `expiredAte` chuỗi milisecond,
                * `maxDiscount` kiểu float,
                * `minOrder` kiểu int, 
                * `thumb`,
                * `sku`
        * `POST /:tid`
            * Thêm reply cho topic
            * **Requires**: `content`
            * **Accepts**: `toPid`
        * `PUT /:tid`
            * Updates post trong topic
            * **Requires**: `pid`, `content`
            * **Accepts**: `handle`, `title`, `topic_thumb`, `tags`
        * `DELETE /:tid`
            * Xóa 1 topic (**Cẩn trọng**: Không có các thông báo xác nhận!)
            * **Accepts**: No parameters
        * `POST /:tid/follow`
            * Đăng ký người dùng topic
            * **Accepts**: No parameters
        * `DELETE /:tid/follow`
            * Hủy đăng ký người dùng topic
            * **Accepts**: No parameters
        * `POST /:tid/tags`
            * Tạo hoặc update tags cho topic
            * **Requires**: `tags`
            * Method này không *thêm* tags, nó chỉ *replaces* các tag của topic
        * `DELETE /:tid/tags`
            * **Accepts**: No parameters
            * Xóa các tag của topic
    * `/pinned-topics`    
        * `GET /`
            * Lấy thông tin tất cả topic đang được pin
            * **Required**: Bearer token
            * **Response**: Mảng các bài viết được ghim được sắp xếp tăng dần theo vị trí, trường `_key` có dạng `pindealbee:{area id}:{position id}`
    * `/posts`
        * `POST /`
            * Thêm một comment (post) cho một topic
            * **Requires**: `uid` (người đăng comment), `tid` (topic được comment), `content`
            * **Accepts**: `timestamp` chuỗi milisecond
            * **Response**: Thông tin của comment vừa tạo
        * `PUT /:pid`
            * Edits post bằng post ID
            * **Requires**: `content`
            * **Accepts**: `title`, `topic_thumb`, `tags`
        * `DELETE /:pid`
            * Deletes post (**Cẩn trọng**: Không có các thông báo xác nhận!)
            * **Accepts**: No parameters
        * `POST /:pid/vote`
            * Votes cho 1 post có `pid`
            * **Requires**: `delta`, `uid` người vote
            * `delta` là một con số. Nếu `delta > 0`, thì được xem là upvotes, nếu `delta < 0`, thì được xem là downvotes, còn lại là unvote.
        * `DELETE /:pid/vote`
            * Unvotes cho 1 post
            * **Required**: `uid` của người unvote
    * `/util`
      * `POST /upload`
      * Uploads 1 File
      * **Accepts**: A multipart files array `files[]`
