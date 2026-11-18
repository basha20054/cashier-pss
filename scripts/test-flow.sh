#!/usr/bin/env bash
# اختبار تكامل حقيقي ضد الخادم العامل — يتحقق من الضمانات المحاسبية
set -u
BASE="${BASE:-http://127.0.0.1:3000}"
J_MGR=/tmp/cj_mgr.txt; J_CSH=/tmp/cj_csh.txt; J_STF=/tmp/cj_stf.txt
rm -f $J_MGR $J_CSH $J_STF
PASS=0; FAIL=0
chk() { # name condition
  if [ "$2" = "0" ]; then PASS=$((PASS+1)); echo "✓ $1"; else FAIL=$((FAIL+1)); echo "✗ $1"; fi
}
jget() { echo "$2" | grep -o "\"$1\":[^,}]*" | head -1 | cut -d: -f2- | tr -d '" '; }

echo "=== 1) المصادقة ==="
R=$(curl -s -c $J_MGR -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"pin":"1357"}')
CHK=$(echo "$R" | grep -c '"role":"manager"'); chk "دخول المدير 1357" "$([ "$CHK" = "1" ]; echo $?)"
curl -s -c $J_CSH -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"pin":"1357"}' >/dev/null
curl -s -c $J_STF -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"pin":"2468"}' >/dev/null
R=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"pin":"9999"}')
CHK=$(echo "$R" | grep -c '401\|غير صحيح'); chk "رفض PIN خاطئ" "$([ "$CHK" = "1" ]; echo $?)"
R=$(curl -s $BASE/api/auth/me)
CHK=$(echo "$R" | grep -c 'غير مسجل\|401'); chk "رفض الوصول بدون جلسة" "$([ "$CHK" = "1" ]; echo $?)"

echo "=== 2) فتح طلب ومنع التكرار/الازدواج ==="
TABLES=$(curl -s -b $J_MGR $BASE/api/tables)
TID=$(echo "$TABLES" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
KEY="test-$(date +%s)-a"
O1=$(curl -s -b $J_STF -X POST $BASE/api/orders -H 'Content-Type: application/json' -d "{\"tableId\":$TID,\"clientKey\":\"$KEY\"}")
OID=$(jget id "$O1" | head -c 10)
O2=$(curl -s -b $J_STF -X POST $BASE/api/orders -H 'Content-Type: application/json' -d "{\"tableId\":$TID,\"clientKey\":\"$KEY\"}")
OID2=$(jget id "$O2" | head -c 10)
chk "إعادة الإرسال بنفس المفتاح ترجع نفس الطلب ($OID=$OID2)" "$([ "$OID" = "$OID2" ]; echo $?)"
O3=$(curl -s -b $J_STF -X POST $BASE/api/orders -H 'Content-Type: application/json' -d "{\"tableId\":$TID,\"clientKey\":\"other-$KEY\"}")
CHK=$(echo "$O3" | grep -c 'طلب نشط\|409'); # قد يرجع 409 أو 200 مع activeOrderId
O3b=$(curl -s -o /dev/null -w '%{http_code}' -b $J_STF -X POST $BASE/api/orders -H 'Content-Type: application/json' -d "{\"tableId\":$TID,\"clientKey\":\"other2-$KEY\"}")
chk "منع طلب ثانٍ نشط لنفس الطاولة (HTTP $O3b)" "$([ "$O3b" = "409" ]; echo $?)"

echo "=== 3) البنود والخصم والإرسال ==="
MENU=$(curl -s -b $J_STF $BASE/api/menu)
MID=$(echo "$MENU" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
curl -s -b $J_STF -X POST $BASE/api/orders/$OID/items -H 'Content-Type: application/json' -d "{\"menuItemId\":$MID,\"quantity\":2}" >/dev/null
curl -s -b $J_STF -X POST $BASE/api/orders/$OID/items -H 'Content-Type: application/json' -d "{\"menuItemId\":$MID,\"quantity\":1,\"notes\":\"بدون سكر\"}" >/dev/null
ORD=$(curl -s -b $J_STF $BASE/api/orders/$OID)
SUB=$(jget subtotal "$ORD")
chk "إضافة بنود والسعر من القاعدة (subtotal=$SUB>0)" "$([ "${SUB:-0}" -gt 0 ]; echo $?)"
R=$(curl -s -b $J_STF -X POST $BASE/api/orders/$OID/discount -H 'Content-Type: application/json' -d '{"discountMinor":100}')
CHK=$(echo "$R" | grep -c 'صلاحية'); chk "الموظف لا يستطيع الخصم (403)" "$([ "$CHK" = "1" ]; echo $?)"
curl -s -b $J_CSH -X POST $BASE/api/orders/$OID/discount -H 'Content-Type: application/json' -d '{"discountMinor":100}' >/dev/null
R=$(curl -s -b $J_CSH -X POST $BASE/api/orders/$OID/discount -H 'Content-Type: application/json' -d '{"discountMinor":99999}')
CHK=$(echo "$R" | grep -cE 'يتجاوز|غير صالح'); chk "رفض خصم أكبر من المجموع" "$([ "$CHK" = "1" ]; echo $?)"
curl -s -b $J_STF -X POST $BASE/api/orders/$OID/send >/dev/null
ORD=$(curl -s -b $J_STF $BASE/api/orders/$OID)
CHK=$(echo "$ORD" | grep -c '"sent"'); chk "إرسال للمطبخ" "$([ "$CHK" = "1" ]; echo $?)"

echo "=== 4) الإغلاق والفاتورة المتسلسلة (idempotent) ==="
C1=$(curl -s -b $J_CSH -X POST $BASE/api/orders/$OID/close)
INV1=$(echo "$C1" | grep -o '"invoice":{"id":[0-9]*' | grep -o '[0-9]*$' | head -1)
NUM1=$(jget number "$C1" | head -c 8)
C2=$(curl -s -b $J_CSH -X POST $BASE/api/orders/$OID/close)
INV2=$(echo "$C2" | grep -o '"invoice":{"id":[0-9]*' | grep -o '[0-9]*$' | head -1)
chk "إغلاق الطلب -> فاتورة #$NUM1 (id=$INV1)" "$([ -n "$INV1" ]; echo $?)"
chk "إعادة الإغلاق ترجع نفس الفاتورة ($INV1=$INV2)" "$([ "$INV1" = "$INV2" ]; echo $?)"

echo "=== 5) الدفع الجزئي ومنع التكرار ==="
INVD=$(curl -s -b $J_CSH $BASE/api/invoices/$INV1)
TOTAL=$(jget totalMinor "$INVD")
PKEY="pay-$(date +%s)"
PART=$(( TOTAL / 2 )); [ "$PART" -lt 1 ] && PART=1
P1=$(curl -s -b $J_CSH -X POST $BASE/api/invoices/$INV1/payments -H 'Content-Type: application/json' -d "{\"amountMinor\":$PART,\"method\":\"cash\",\"idempotencyKey\":\"$PKEY\"}")
PID1=$(jget id "$P1" | head -c 8)
P2=$(curl -s -b $J_CSH -X POST $BASE/api/invoices/$INV1/payments -H 'Content-Type: application/json' -d "{\"amountMinor\":$PART,\"method\":\"cash\",\"idempotencyKey\":\"$PKEY\"}")
PID2=$(jget id "$P2" | head -c 8)
chk "الدفع الجزئي الأول ($PART)" "$([ -n "$PID1" ]; echo $?)"
chk "إعادة نفس المفتاح لا تضاعف الدفعة ($PID1=$PID2)" "$([ "$PID1" = "$PID2" ]; echo $?)"
# الموظف لا يستطيع القبض
R=$(curl -s -b $J_STF -X POST $BASE/api/invoices/$INV1/payments -H 'Content-Type: application/json' -d "{\"amountMinor\":100,\"method\":\"cash\",\"idempotencyKey\":\"x-$PKEY\"}")
CHK=$(echo "$R" | grep -c 'صلاحية'); chk "الموظف ممنوع من تسجيل دفعات" "$([ "$CHK" = "1" ]; echo $?)"
# تجاوز المتبقي
BIG=$(( TOTAL * 2 ))
R=$(curl -s -b $J_CSH -X POST $BASE/api/invoices/$INV1/payments -H 'Content-Type: application/json' -d "{\"amountMinor\":$BIG,\"method\":\"card\",\"idempotencyKey\":\"big-$PKEY\"}")
CHK=$(echo "$R" | grep -c 'يتجاوز'); chk "رفض دفعة أكبر من المتبقي" "$([ "$CHK" = "1" ]; echo $?)"
# إتمام الباقي
INVD=$(curl -s -b $J_CSH $BASE/api/invoices/$INV1)
REM=$(jget remaining "$INVD")
curl -s -b $J_CSH -X POST $BASE/api/invoices/$INV1/payments -H 'Content-Type: application/json' -d "{\"amountMinor\":$REM,\"method\":\"electronic\",\"idempotencyKey\":\"rest-$PKEY\"}" >/dev/null
INVD=$(curl -s -b $J_CSH $BASE/api/invoices/$INV1)
CHK=$(echo "$INVD" | grep -c '"status":"paid"'); chk "إتمام السداد -> مسددة" "$([ "$CHK" = "1" ]; echo $?)"

echo "=== 6) الاسترداد: سبب إلزامي + مدير فقط ==="
R=$(curl -s -b $J_STF -X POST $BASE/api/invoices/$INV1/refunds -H 'Content-Type: application/json' -d '{"amountMinor":100,"reason":"خطأ إدخال","idempotencyKey":"rf-cashier-1"}')
CHK=$(echo "$R" | grep -c 'صلاحية'); chk "غير المدير ممنوع من الاسترداد" "$([ "$CHK" = "1" ]; echo $?)"
R=$(curl -s -b $J_MGR -X POST $BASE/api/invoices/$INV1/refunds -H 'Content-Type: application/json' -d '{"amountMinor":100,"reason":"","idempotencyKey":"rf-noreason-1"}')
CHK=$(echo "$R" | grep -c 'إلزامي'); chk "رفض استرداد بدون سبب" "$([ "$CHK" = "1" ]; echo $?)"
RKEY="rf-$(date +%s)"
R1=$(curl -s -b $J_MGR -X POST $BASE/api/invoices/$INV1/refunds -H 'Content-Type: application/json' -d "{\"amountMinor\":100,\"reason\":\"اختبار استرداد\",\"idempotencyKey\":\"$RKEY\"}")
RID1=$(jget id "$R1" | head -c 8)
R2=$(curl -s -b $J_MGR -X POST $BASE/api/invoices/$INV1/refunds -H 'Content-Type: application/json' -d "{\"amountMinor\":100,\"reason\":\"اختبار استرداد\",\"idempotencyKey\":\"$RKEY\"}")
RID2=$(jget id "$R2" | head -c 8)
chk "استرداد المدير بسبب (id=$RID1)" "$([ -n "$RID1" ]; echo $?)"
chk "إعادة الاسترداد بنفس المفتاح لا تضاعفه ($RID1=$RID2)" "$([ "$RID1" = "$RID2" ]; echo $?)"

echo "=== 7) ترقيم متسلسل + تقرير يومي ==="
# طاولة ثانية -> طلب -> بند -> إغلاق => رقم = NUM1+1
T2=$(echo "$TABLES" | grep -o '"id":[0-9]*' | sed -n '2p' | cut -d: -f2)
O_=$(curl -s -b $J_STF -X POST $BASE/api/orders -H 'Content-Type: application/json' -d "{\"tableId\":$T2,\"clientKey\":\"seq-$KEY\"}")
O_ID=$(jget id "$O_" | head -c 10)
curl -s -b $J_STF -X POST $BASE/api/orders/$O_ID/items -H 'Content-Type: application/json' -d "{\"menuItemId\":$MID,\"quantity\":1}" >/dev/null
C3=$(curl -s -b $J_CSH -X POST $BASE/api/orders/$O_ID/close)
NUM2=$(jget number "$C3" | head -c 8)
chk "ترقيم متسلسل ($NUM1 ثم $NUM2)" "$([ "$(( NUM1 + 1 ))" = "$NUM2" ]; echo $?)"
REP=$(curl -s -b $J_CSH $BASE/api/reports/daily)
CHK=$(echo "$REP" | grep -c '"invoicesCount"'); chk "التقرير اليومي يعمل" "$([ "$CHK" = "1" ]; echo $?)"
TODAY_INV=$(jget invoicesCount "$REP")
chk "التقرير يحسب فاتورتَي الاختبار (>=2, فعلي=$TODAY_INV)" "$([ "${TODAY_INV:-0}" -ge 2 ]; echo $?)"
R=$(curl -s -b $J_STF $BASE/api/reports/daily)
CHK=$(echo "$R" | grep -c 'صلاحية'); chk "الموظف ممنوع من التقرير" "$([ "$CHK" = "1" ]; echo $?)"

echo ""
echo "================النتيجة: نجح $PASS · فشل $FAIL================"
[ "$FAIL" = "0" ]
