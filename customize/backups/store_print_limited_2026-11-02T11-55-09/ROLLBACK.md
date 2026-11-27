# 店舗帳票 限定反映 — 復旧手順

```json
{
  "at": "2026-11-02T11:55:18.485Z",
  "dir": "/workspace/customize/backups/store_print_limited_2026-11-02T11-55-09",
  "steps": [
    "1. プラグイン: システム管理 > プラグイン で旧 plugin.zip（バックアップ）を Import",
    "2. App19: customize/backups/.../app19 の JS を元の順で再登録 → アプリを更新",
    "3. App16: 変更した場合のみ同様に復元（今回は store_order_create_link 未追加なら不要）",
    "4. 対象アプリをハードリロード"
  ],
  "app19_restore_order": {
    "js": [
      {
        "type": "FILE",
        "file": {
          "fileKey": "202611011544195AA9EABF1B214D27BC7C2CD3A4A05796007",
          "name": "internal_ops_config.js",
          "contentType": "text/javascript",
          "size": "4315"
        }
      },
      {
        "type": "FILE",
        "file": {
          "fileKey": "202611011544190EE8D1055B954CB78C17B7E3F20DF15C209",
          "name": "complete_register_engine.js",
          "contentType": "text/javascript",
          "size": "17573"
        }
      },
      {
        "type": "FILE",
        "file": {
          "fileKey": "2026110115442038A04E7D784243EE8FABD4273437CF65040",
          "name": "delivery_completion_guard.js",
          "contentType": "text/javascript",
          "size": "5932"
        }
      },
      {
        "type": "FILE",
        "file": {
          "fileKey": "202611011544206DEC58F98A794733A12C22CF61F37B30302",
          "name": "barcode_delivery.js",
          "contentType": "text/javascript",
          "size": "7371"
        }
      },
      {
        "type": "FILE",
        "file": {
          "fileKey": "202611011544200ADDC79C00994D56A5F6D6F4223F9587204",
          "name": "store_pickup_shared.js",
          "contentType": "text/javascript",
          "size": "9988"
        }
      },
      {
        "type": "FILE",
        "file": {
          "fileKey": "2026110115442017206F98E3EC4713ACB5E1DE0836F8ED100",
          "name": "delivery_complete_sync.js",
          "contentType": "text/javascript",
          "size": "17790"
        }
      },
      {
        "type": "FILE",
        "file": {
          "fileKey": "20261101154420A32931FFD463446E92E9F7CCE52E26B3086",
          "name": "delivery_a550_edit_guard.js",
          "contentType": "text/javascript",
          "size": "3106"
        }
      },
      {
        "type": "FILE",
        "file": {
          "fileKey": "2026110115442027489AA5FAD14816B9BB686E34A9B087123",
          "name": "price_master_register.js",
          "contentType": "text/javascript",
          "size": "12890"
        }
      },
      {
        "type": "FILE",
        "file": {
          "fileKey": "202611011544205DDDE2F0D6AE461A95985E47A0A93773078",
          "name": "delivery_additional_item_guard.js",
          "contentType": "text/javascript",
          "size": "1851"
        }
      },
      {
        "type": "FILE",
        "file": {
          "fileKey": "20261101154420611AA98537054DA2A913C863C48A2090255",
          "name": "additional_item_engine.js",
          "contentType": "text/javascript",
          "size": "26476"
        }
      }
    ],
    "css": []
  },
  "note": "本番一括データ更新は行っていない。レコード復元は不要（印刷は参照のみ）。"
}
```
