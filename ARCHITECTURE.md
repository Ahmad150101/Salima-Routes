# معمارية Salima Routes

## تدفق البيانات

```text
UI events → validation → application state → StorageManager/localStorage
                               ↓
                    RoutingProvider (OSRM)
                       ↓            ↓
                road geometry   local fallback
                       ↓            ↓
                 MapLibre route renderer + comparison cards
```

## الوحدات

- `js/app.js`: تنسيق دورة التطبيق والأحداث دون تنفيذ تفاصيل الخريطة أو التخزين داخله.
- `js/config.js`: ثوابت الأنماط والحدود والمهلات وعنوان المزود التجريبي.
- `js/map/`: تهيئة MapLibre مرة واحدة، العلامات الآمنة، ورسم الطريق الحقيقي أو المتقطع.
- `js/routing/`: عقد `RoutingProvider`، مزود OSRM، cache ذاكرة مؤقت، وNearest Neighbor + 2-opt + fallback.
- `js/data/`: schema v3، migration، التخزين، عمليات الزبائن، والاستيراد/التصدير.
- `js/ui/`: القوائم والنتائج والحوارات والرسائل.
- `js/utils/`: validation والجغرافيا والتنسيق.

## Schema

الحالة الجذرية تحتوي `schemaVersion`, `customers`, `warehouse`, `vehicleSettings`, `routePreferences`, و`uiPreferences`. كل زبون يحتوي هوية واسماً وإحداثيات ودقة ومصدر موقع وحالة طلبية وتواريخ إنشاء وتحديث.

يقرأ `StorageManager` مفتاح v3 أولاً ثم مفاتيح الإصدار القديم. لا يحذف المفاتيح القديمة. عند تلف JSON يحتفظ بالنص في الذاكرة ويعرض خيار تنزيله قبل إعادة الضبط اليدوي.

## الأمان والخصوصية

- عناصر المستخدم تُعرض عبر `textContent` وDOM APIs، لا عبر HTML ديناميكي.
- الاستيراد محدود إلى 1MB، يفحص البنية والإحداثيات ومفاتيح prototype pollution.
- CSP تسمح فقط للمشروع وMapLibre CDN وOpenFreeMap وOSRM.
- Service Worker يخزن shell المحلي فقط ولا يخزن طلبات routing أو بيانات الزبائن.

## استبدال مزود الطرق

نفّذ `getRoute`, `getMatrix`, `optimizeRoute`, و`healthCheck` في Adapter جديد يرث `RoutingProvider`، ثم حقنه في `app.js`. لا تحتاج بقية الواجهة إلى إعادة بناء.
