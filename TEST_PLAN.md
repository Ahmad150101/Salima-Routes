# خطة اختبار Salima Routes

## آلي

شغّل `npm run verify`. تغطي الاختبارات validation، CRUD، التكرار، التخزين والترحيل، الاستيراد والتصدير، الملفات التالفة والكبيرة، Haversine والوقود، Nearest Neighbor و2-opt، العودة وعدم العودة، البدائل الثلاثة، cache وفشل الشبكة، الوضع الليلي وReduced Motion، غياب الاعتمادات المحظورة والأسرار، وArtifact النشر.

## Desktop

- افتح الصفحة وتأكد من الخريطة دون 404 أو أخطاء Console غير متوقعة.
- اختبر Liberty وPositron وDark وأزرار التكبير وFullscreen وGeolocate وScale.
- أضف زبوناً من الخريطة ثم GPS ثم إحداثيات يدوية؛ عدّل واحذف وجرّب الاسم المكرر.
- اختبر البحث والفلاتر والتحديد الجماعي وPopup وأزراره.
- حدد المستودع واحسب المسارات الثلاثة مع العودة وبدونها.
- افصل الشبكة وتأكد من الخط المتقطع ورسالة المسار التقديري.
- اختبر الوضع الليلي والتصدير والاستيراد وحذف جميع البيانات بعد التأكيد.

## Mobile

- جرّب viewport بعرض 375px وتأكد من عدم وجود horizontal scroll.
- افتح وأغلق Bottom Sheet وتأكد أن الخريطة لا تختفي خلفها.
- تحقق من حجم الأزرار وPopup وGPS عبر HTTPS ومن قابلية تثبيت PWA.

## Accessibility

- تنقل بـTab وShift+Tab، استخدم رابط تجاوز الخريطة، وافتح الحوارات وأغلقها بـEscape.
- افحص focus-visible وaria labels والـlive region والتباين في الوضعين.
- فعّل `prefers-reduced-motion` وتأكد من توقف الحركات غير الضرورية.

## GitHub Pages

- تأكد أن Workflow ينجح قبل deploy وأن Artifact لا يحتوي `test/`, `scripts/`, `node_modules/` أو ملفات تطوير.
- افتح الرابط المنشور تحت `/Salima-Routes/` وتحقق من manifest وService Worker والتحديث.
