-- =====================================================================
-- بيانات أولية لقاعدة بيانات الإنتاج — الصقه في SQL Editor
-- (Neon: SQL Editor · Supabase: SQL Editor) ثم Run
-- آمن للتكرار: كل عبارة تتحقق أولاً مما هو موجود
-- بعد التشغيل: افتح الموقع وسجّل الدخول بالمدير 1357 · الموظف 2468
-- =====================================================================

-- 1) إعدادات المطعم (صف واحد)
INSERT INTO settings (restaurant_name, currency, tax_bps, timezone)
SELECT 'Lord Cafe', 'ILS', 0, 'Asia/Hebron'
WHERE NOT EXISTS (SELECT 1 FROM settings);

-- 2) عدّاد أرقام الفواتير
INSERT INTO seq_counters (key, value)
VALUES ('invoice_number', 0)
ON CONFLICT (key) DO NOTHING;

-- 3) المستخدمون (الأرقام: مدير 1357 · موظف 2468)
INSERT INTO users (name, role, pin_hash, active)
SELECT v.name, v.role::user_role, v.pin, true
FROM (VALUES
  ('المدير',  'manager', 'c3796de76b268ec9:1f5dd9a5a7187863dd3be6b351841a3f13a9185e7afc6ef65362d34b9e7ad189'),
  ('الموظف',  'staff',   '4a7ca5bf63359ff3:b71aa6ae462ca6769ac1f3c3a2fe40f97e59f44ae39467d9122022115c43abac')
) AS v(name, role, pin)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.role = v.role::user_role);

-- 4) الطاولات الثماني
INSERT INTO dining_tables (name, sort_order)
SELECT t.name, t.ord
FROM (VALUES
  ('طاولة 1',1),('طاولة 2',2),('طاولة 3',3),('طاولة 4',4),
  ('طاولة 5',5),('طاولة 6',6),('طاولة 7',7),('طاولة 8',8)
) AS t(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM dining_tables d WHERE d.name = t.name);

-- 5) التصنيفات الخمسة
INSERT INTO categories (name, sort_order)
SELECT c.name, c.ord
FROM (VALUES
  ('مشروبات ساخنة',1),('مشروبات باردة',2),('حلويات',3),('وجبات',4),('أراكيل',5)
) AS c(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM categories x WHERE x.name = c.name);

-- 6) الأصناف الستة والعشرون (الأسعار والأكواب بالأجورات: 1200 = 12.00 ₪)
INSERT INTO menu_items (category_id, name, price_minor, cost_minor, sort_order)
SELECT cat.id, v.name, v.price, v.cost, v.ord
FROM (VALUES
  ('مشروبات ساخنة','إسبريسو',800,250,1),
  ('مشروبات ساخنة','قهوة تركية',1000,300,2),
  ('مشروبات ساخنة','كابتشينو',1400,450,3),
  ('مشروبات ساخنة','كافيه لاتيه',1500,500,4),
  ('مشروبات ساخنة','شاي بالنعناع',900,200,5),
  ('مشروبات ساخنة','هوت شوكليت',1400,550,6),
  ('مشروبات ساخنة','سحلب',1500,500,7),
  ('مشروبات باردة','عصير برتقال طازج',1500,600,8),
  ('مشروبات باردة','ليمون بالنعناع',1500,500,9),
  ('مشروبات باردة','آيس لاتيه',1600,550,10),
  ('مشروبات باردة','ميلك شيك',1800,800,11),
  ('مشروبات باردة','موهيتو',1700,600,12),
  ('مشروبات باردة','مياه معدنية',400,150,13),
  ('حلويات','كنافة نابلسية',2000,900,14),
  ('حلويات','تشيز كيك',1800,750,15),
  ('حلويات','براونيز',1600,600,16),
  ('حلويات','أم علي',1500,650,17),
  ('وجبات','شاورما دجاج',2500,1100,18),
  ('وجبات','برغر لحم',3000,1400,19),
  ('وجبات','بيتزا مارغريتا',3500,1300,20),
  ('وجبات','سلطة سيزر',2800,1000,21),
  ('وجبات','بطاطا مقلية',1200,400,22),
  ('وجبات','صحن مقبلات مشكّل',3500,1500,23),
  ('أراكيل','أرجيلة تفاحتين',2500,700,24),
  ('أراكيل','أرجيلة عنب نعناع',2500,700,25),
  ('أراكيل','أرجيلة خوخ',2800,800,26)
) AS v(cat, name, price, cost, ord)
JOIN categories cat ON cat.name = v.cat
WHERE NOT EXISTS (SELECT 1 FROM menu_items m WHERE m.name = v.name);

-- 7) (اختياري) إعادة تعيين رقم المدير إلى 1357 إن نسيته بعد التغيير:
-- UPDATE users SET pin_hash = 'c3796de76b268ec9:1f5dd9a5a7187863dd3be6b351841a3f13a9185e7afc6ef65362d34b9e7ad189' WHERE role = 'manager';
