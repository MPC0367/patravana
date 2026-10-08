/* ============================================================
   PATRAVANA: the operational facts, in one place, for both languages.
   Anything a guest could act on (who to call, when the kitchen serves, how many the hall holds, what an offer gives,
   what is known about pet stays) is written here once. The page prints it through [data-fact] elements and the
   scripts read it directly, so a card, a drawer, a translation and a booking link cannot drift apart.

   Rules for editing:
   - A value that is not known is null. Never an empty list, never a made-up id.
   - Numbers, dates, codes and destinations live in the data; the sentences in `text` only quote them with {path}.
   - Run  node _qa/check-facts.mjs  after any change: it checks the page's built-in English against this file.
   ============================================================ */
window.PV_FACTS = {
  reviewed: "2026-10-08",                               // when these facts were last checked against the resort's own pages

  contact: {
    phone: { tel: "+66885041888", show: "+66 88 504 1888", local: "088-504-1888" },
    diningPhones: [{ tel: "+66840887785", show: "+66 84 088 7785" }, { tel: "+66840887786", show: "+66 84 088 7786" }],
    line: { id: "@patravana", url: "https://www.patravana.com/line-qr-code" },   // the resort's LINE page: it shows a QR code, it does not open a chat
    email: "info@patravanaresort.com",
    map: "https://maps.app.goo.gl/nnPAtFGH4KwDBAJA9",
    gps: "14.559493, 101.256252",
    // the resort's own address, as printed on its contact page
    address: {
      en: ["88/1, 88/88-93 Moo 5, Phayayen,", "Pak Chong, Nakhon Ratchasima 30320"],
      th: ["88/1, 88/88-93 หมู่ 5 ต.พญาเย็น", "อ.ปากช่อง จ.นครราชสีมา 30320"]
    }
  },

  /* The booking page the site hands over to. It keeps checkin, checkout, adults and roomtype (its own room id).
     It does not carry children, extra rooms, promo codes or anything about pets, and nothing here pretends it does. */
  booking: {
    engine: "https://letsbook.me/booking/patravanaresortkhaoyai",
    adultsMin: 1,
    adultsMax: 3,                                       // the most adults one suite takes (2, or 3 with the extra bed)
    // family and view are what a guest chooses; id is the provider's inventory id, kept as text so no digit is lost
    rooms: [
      { id: "3446300000000000005", family: "vana", view: "lake" },
      { id: "3446300000000000004", family: "vana", view: "garden" },
      { id: "3446300000000000003", family: "vana", view: "country" },
      { id: "3446300000000000008", family: "patra", view: "lake" },
      { id: "3446300000000000007", family: "patra", view: "garden" },
      { id: "3446300000000000006", family: "junior", view: "garden" }
    ]
  },

  /* Pet stays. The one confirmed fact: pets are accepted in ONE designated building. Which building, which rooms,
     which pets and under what rules have not been supplied, so those stay null and the page says only what is known.
     A room family or a view is not a building: do not fill these from the room list above. */
  pet: {
    petStaysOffered: true,
    eligibleBuildingCount: 1,
    eligibleBuildingId: null,                           // until the owner names the building
    eligibleBuildingDisplayName: null,
    eligiblePhysicalUnitIds: null,                      // until an approved room-by-room list exists
    eligibleBookingInventoryIds: null,                  // until checked against the booking provider
    eligibilityMappingStatus: "unverified",             // unverified | confirmed | suspended
    mapPin: null,                                       // { x, y } on the estate map, only once the location is confirmed
    approvedDetails: null,                              // owner-approved rules, as [{ en, th }]; printed in "Pet-stay details" when present
    policyVersion: "2026-10-08.1",
    lastReviewedAt: "2026-10-08"
  },

  // the seminar hall, as listed on the resort's seminar page. Full hall and half hall are separate figures: never mix them
  hall: {
    areaSqm: 280,
    layouts: [
      { key: "theatre", full: 220, halfA: 100, halfB: 120 },
      { key: "classroom", full: 168, halfA: 72, halfB: 84 },
      { key: "banquet", full: 120, halfA: 40, halfB: 60, tables: 12 },
      { key: "ushape", full: 64, halfA: 29, halfB: 35 }
    ]
  },

  // Phu Yai Lee, as listed on the resort's dining page. Days are 0 (Sunday) to 6 (Saturday), times are resort time
  dining: {
    seats: 150,
    breakfast: { days: [0, 1, 2, 3, 4, 5, 6], open: "07:00", close: "10:00" },
    kitchen: { days: [0, 3, 4, 5, 6], open: "11:00", close: "21:00" }
  },

  /* Offers, as read from the resort's booking page on the review date. `stayUntil` is the last night an offer covers;
     an offer past that date shows as ended. The direct rate needs no code, so it has no copy button. */
  offers: {
    direct: { percent: 30, code: null, stayUntil: "2027-03-31", refundable: true, freeCancelHours: 48 },
    code: { percent: 15, code: "refresh2026", stayFrom: "2026-10-02", stayUntil: "2027-03-31", refundable: false, stacksOnDirect: true }
  },

  /* The sentences that quote the facts. {path} is filled from the data above ({hall.theatre.full}, {offers.code.until},
     {contact.phone.show}); the same sentence is used wherever the page needs it. */
  text: {
    "pet.summary": { en: "Pet-friendly stays are available in one designated building.", th: "รีสอร์ทรับสัตว์เลี้ยงเข้าพักได้ในอาคารที่กำหนดไว้หนึ่งอาคาร" },
    "pet.body": { en: "Planning to bring your pet? Contact the team to confirm an eligible room for your dates and the current pet-stay details.", th: "วางแผนพาสัตว์เลี้ยงมาด้วยใช่ไหม ติดต่อทีมงานเพื่อยืนยันห้องที่เข้าพักพร้อมสัตว์เลี้ยงได้ในวันที่คุณต้องการ และรายละเอียดการเข้าพักพร้อมสัตว์เลี้ยงในปัจจุบัน" },
    "pet.short": { en: "Pet-friendly stays are available in one designated building. Contact the team to confirm an eligible room.", th: "รีสอร์ทรับสัตว์เลี้ยงเข้าพักได้ในอาคารที่กำหนดไว้หนึ่งอาคาร ติดต่อทีมงานเพื่อยืนยันห้องที่เข้าพักได้" },
    "pet.booknote": { en: "General room availability does not confirm a pet-friendly allocation.", th: "ห้องว่างทั่วไปไม่ได้ยืนยันว่าเป็นห้องที่เข้าพักพร้อมสัตว์เลี้ยงได้" },
    "pet.point1": { en: "Pet stays are offered in one building of the resort. They are not available in every suite.", th: "รับสัตว์เลี้ยงเข้าพักในอาคารหนึ่งหลังของรีสอร์ท ไม่ได้เปิดรับในทุกห้องสวีท" },
    "pet.point2": { en: "The team confirms a pet-eligible room for your dates. A general room search does not do that.", th: "ทีมงานจะยืนยันห้องที่เข้าพักพร้อมสัตว์เลี้ยงได้สำหรับวันที่ของคุณ การค้นหาห้องว่างทั่วไปไม่ได้ยืนยันเรื่องนี้" },
    "pet.point3": { en: "Ask reservations which pet-stay details apply on your dates, so nothing is a surprise on arrival.", th: "สอบถามทีมสำรองห้องพักว่ารายละเอียดการเข้าพักพร้อมสัตว์เลี้ยงข้อใดมีผลในวันที่คุณเข้าพัก จะได้เตรียมตัวก่อนเดินทาง" },
    "pet.askteam": { en: "Which pets, how many, and any conditions are confirmed by the team for your stay.", th: "ประเภทสัตว์เลี้ยง จำนวน และเงื่อนไขต่าง ๆ ทีมงานจะยืนยันให้ตามการเข้าพักของคุณ" },
    "pet.reviewed": { en: "Last reviewed {pet.reviewed}.", th: "ตรวจสอบล่าสุดเมื่อ {pet.reviewed}" },

    "hall.fac": { en: "{hall.area} m² beside the resort, divisible into two rooms, with stage, sound and a dressing room. Up to {hall.theatre.full} guests in theatre rows, full hall.", th: "{hall.area} ตร.ม. ข้างรีสอร์ท แบ่งเป็นสองห้องได้ พร้อมเวที เครื่องเสียง และห้องแต่งตัว รองรับสูงสุด {hall.theatre.full} ท่านแบบเธียเตอร์ เมื่อใช้เต็มห้อง" },
    "hall.note": { en: "An outdoor amphitheatre over the lake, and a {hall.area} m² seminar hall beside the resort that divides into two rooms.", th: "อัฒจันทร์กลางแจ้งเหนือบึงน้ำ และห้องสัมมนา {hall.area} ตร.ม. ข้างรีสอร์ท ที่แบ่งเป็นสองห้องได้" },
    "hall.know": { en: "Seminar hall for up to {hall.theatre.full} guests in theatre rows. Send a group enquiry for dates and a quote.", th: "ห้องสัมมนารองรับสูงสุด {hall.theatre.full} ท่านแบบเธียเตอร์ ส่งคำขอแบบหมู่คณะเพื่อสอบถามวันและราคา" },
    "hall.faq": { en: "Yes. The seminar hall beside the resort is {hall.area} m² and divides into two rooms. With the full hall it takes {hall.theatre.full} guests in theatre rows, {hall.classroom.full} in classroom rows, {hall.banquet.full} for a banquet and {hall.ushape.full} in a U-shape.", th: "ได้ ห้องสัมมนาข้างรีสอร์ทมีพื้นที่ {hall.area} ตร.ม. และแบ่งเป็นสองห้องได้ เมื่อใช้เต็มห้องรองรับ {hall.theatre.full} ท่านแบบเธียเตอร์ {hall.classroom.full} ท่านแบบคลาสรูม {hall.banquet.full} ท่านแบบโต๊ะจีน และ {hall.ushape.full} ท่านแบบตัวยู" },
    "hall.stat": { en: "of seminar hall beside the resort, up to {hall.theatre.full} guests", th: "ห้องสัมมนาข้างรีสอร์ท รองรับสูงสุด {hall.theatre.full} ท่าน" },

    "dining.note": { en: "Thai cooking with a few international dishes. Up to {dining.seats} seats, indoors and outdoors.", th: "อาหารไทยพร้อมเมนูนานาชาติอีกไม่กี่จาน รองรับได้ถึง {dining.seats} ที่นั่ง ทั้งในร่มและกลางแจ้ง" },
    "dining.fac": { en: "Thai cooking, up to {dining.seats} seats indoors and on the timber deck, breakfast daily from {dining.breakfast.open}.", th: "อาหารไทย รองรับได้ถึง {dining.seats} ที่นั่งในร่มและบนระเบียงไม้ อาหารเช้าทุกวันตั้งแต่ {dining.breakfast.open} น." },
    "dining.hot": { en: "Phu Yai Lee, the resort's restaurant. Thai cooking with a few international dishes, indoors and outdoors, up to {dining.seats} seats.", th: "ครัวผู้ใหญ่ลี ร้านอาหารของรีสอร์ท อาหารไทยพร้อมเมนูนานาชาติ ทั้งในร่มและกลางแจ้ง รองรับได้ถึง {dining.seats} ที่นั่ง" },
    // the weekday wording belongs with dining.breakfast.days and dining.kitchen.days above: change them together
    "dining.row.breakfast": { en: "Breakfast, every day", th: "อาหารเช้า ทุกวัน" },
    "dining.row.kitchen": { en: "Lunch and dinner, Wednesday to Sunday", th: "มื้อกลางวันและมื้อเย็น พุธถึงอาทิตย์" },
    "dining.row.rest": { en: "Monday and Tuesday", th: "จันทร์และอังคาร" },
    "dining.row.restv": { en: "Breakfast only", th: "เฉพาะอาหารเช้า" },
    "dining.breakfast.hours": { en: "{dining.breakfast.open} to {dining.breakfast.close}", th: "{dining.breakfast.open} ถึง {dining.breakfast.close} น." },
    "dining.kitchen.hours": { en: "{dining.kitchen.open} to {dining.kitchen.close}", th: "{dining.kitchen.open} ถึง {dining.kitchen.close} น." },
    "dining.know": { en: "Served daily at Phu Yai Lee, {dining.breakfast.open} to {dining.breakfast.close}. Whether it is included depends on the rate you book.", th: "เสิร์ฟทุกวันที่ครัวผู้ใหญ่ลี {dining.breakfast.open} ถึง {dining.breakfast.close} น. จะรวมในราคาหรือไม่ขึ้นอยู่กับแพ็กเกจที่จอง" },
    "dining.faq.breakfast": { en: "It depends on the rate. The resort's booking page offers rates with breakfast and room-only rates, and names what each one includes before you confirm. Breakfast is served daily at Phu Yai Lee, {dining.breakfast.open} to {dining.breakfast.close}.", th: "ขึ้นอยู่กับแพ็กเกจราคา หน้าจองของรีสอร์ทมีทั้งราคาที่รวมอาหารเช้าและราคาเฉพาะห้องพัก และระบุสิ่งที่รวมอยู่ในแต่ละราคาก่อนยืนยันการจอง อาหารเช้าเสิร์ฟทุกวันที่ครัวผู้ใหญ่ลี {dining.breakfast.open} ถึง {dining.breakfast.close} น." },
    "dining.faq.hours": { en: "Breakfast is served every day, {dining.breakfast.open} to {dining.breakfast.close}. Lunch and dinner are served Wednesday to Sunday, {dining.kitchen.open} to {dining.kitchen.close}. On Monday and Tuesday there is breakfast only. For a table, call {contact.dining.show}.", th: "อาหารเช้าเสิร์ฟทุกวัน {dining.breakfast.open} ถึง {dining.breakfast.close} น. มื้อกลางวันและมื้อเย็นเปิดวันพุธถึงวันอาทิตย์ {dining.kitchen.open} ถึง {dining.kitchen.close} น. วันจันทร์และวันอังคารมีเฉพาะอาหารเช้า สำรองโต๊ะโทร {contact.dining.show}" },
    // Phu Yai Lee right now, by the listed hours. Each line names the service it is about
    "dining.status.breakfast": { en: "Breakfast hours now, until {dining.breakfast.close}", th: "ขณะนี้เป็นช่วงอาหารเช้า ถึง {dining.breakfast.close} น." },
    "dining.status.kitchen": { en: "Lunch and dinner hours now, until {dining.kitchen.close}", th: "ขณะนี้เป็นช่วงมื้อกลางวันและมื้อเย็น ถึง {dining.kitchen.close} น." },
    "dining.status.soon": { en: "Lunch and dinner from {dining.kitchen.open}", th: "มื้อกลางวันและมื้อเย็นเริ่ม {dining.kitchen.open} น." },
    "dining.status.early": { en: "Breakfast from {dining.breakfast.open}", th: "อาหารเช้าเริ่ม {dining.breakfast.open} น." },
    "dining.status.tomorrow": { en: "Breakfast tomorrow from {dining.breakfast.open}", th: "อาหารเช้าพรุ่งนี้เริ่ม {dining.breakfast.open} น." },
    "dining.status.rest": { en: "No lunch or dinner service today. Breakfast tomorrow from {dining.breakfast.open}", th: "วันนี้ไม่มีมื้อกลางวันและมื้อเย็น อาหารเช้าพรุ่งนี้เริ่ม {dining.breakfast.open} น." },

    "offers.kicker": { en: "Offers as of {reviewed}", th: "ข้อเสนอ ณ วันที่ {reviewed}" },
    "offers.direct.big": { en: "{offers.direct.percent}%", th: "{offers.direct.percent}%" },
    "offers.direct.desc": { en: "The direct rate on the resort's booking page for stays through {offers.direct.until}. Free cancellation up to {offers.direct.freeCancelHours} hours before check-in.", th: "ราคาจองตรงในหน้าจองของรีสอร์ท สำหรับการเข้าพักถึง {offers.direct.until} ยกเลิกฟรีได้ถึง {offers.direct.freeCancelHours} ชั่วโมงก่อนเช็คอิน" },
    "offers.code.tag": { en: "Until {offers.code.until}", th: "ถึง {offers.code.until}" },
    "offers.code.big": { en: "{offers.code.percent}%", th: "{offers.code.percent}%" },
    "offers.code.desc": { en: "Enter the code on the resort's booking page. It adds to the {offers.direct.percent}% direct rate, about {offers.code.total}% off in all. For stays until {offers.code.until}, non-refundable.", th: "กรอกโค้ดในหน้าจองของรีสอร์ท ลดเพิ่มจากราคาจองตรงที่ลด {offers.direct.percent}% แล้ว รวมประมาณ {offers.code.total}% สำหรับการเข้าพักถึง {offers.code.until} ไม่สามารถขอคืนเงินได้" },

    "book.note": { en: "Opens in a new tab with your dates, adults and room choice. A promo code is copied for you to paste there. Children and extra rooms are added on that page. You can also book by phone on {contact.phone.local} or on LINE.", th: "เปิดในแท็บใหม่พร้อมวันที่ จำนวนผู้ใหญ่ และห้องที่คุณเลือก โค้ดส่วนลดจะถูกคัดลอกไว้ให้นำไปวางในหน้านั้น ส่วนเด็กและห้องเพิ่มให้เลือกในหน้าจอง จองทางโทรศัพท์ {contact.phone.local} หรือ LINE ก็ได้เช่นกัน" },
    "book.more": { en: "Each suite takes up to {booking.adultsMax} adults. Your dates carry over. Add rooms and guests on the booking page, or ask the team.", th: "หนึ่งห้องสวีทพักได้สูงสุด {booking.adultsMax} ท่าน วันที่ของคุณจะถูกส่งต่อไป เพิ่มห้องและผู้เข้าพักได้ในหน้าจอง หรือสอบถามทีมงาน" },
    "stay.faq.beds": { en: "Each suite is set up for two adults, and one extra bed can be added for a third. Children are added on the resort's booking page, which shows what each room can take for your party.", th: "แต่ละห้องสวีทจัดไว้สำหรับผู้ใหญ่สองท่าน และเสริมเตียงได้หนึ่งเตียงสำหรับท่านที่สาม ส่วนเด็กให้เพิ่มในหน้าจองของรีสอร์ท ซึ่งจะแสดงว่าแต่ละห้องรองรับผู้เข้าพักของคุณได้อย่างไร" },

    "visit.address": { en: "{contact.address.br}", th: "{contact.address.br}" },
    "foot.address": { en: "{contact.address.line}", th: "{contact.address.line}" },

    /* the enquiry a guest prepares on this page. {slots} in capitals-free braces are filled from what the guest typed */
    "enq.pet.msg": {
      en: "Hello Patravana team.\nI would like to ask about a pet-friendly stay in your designated building.\nDates: {dates}\nGuests: {guests}\nPreferred suite: {suite}\nPet details: {pet}{question}\nCould you confirm an eligible room and the current pet-stay requirements?",
      th: "สวัสดีทีมงานภัทราวานา\nขอสอบถามเรื่องการเข้าพักพร้อมสัตว์เลี้ยงในอาคารที่รีสอร์ทกำหนดไว้\nวันที่: {dates}\nผู้เข้าพัก: {guests}\nห้องที่สนใจ: {suite}\nรายละเอียดสัตว์เลี้ยง: {pet}{question}\nรบกวนยืนยันห้องที่เข้าพักพร้อมสัตว์เลี้ยงได้ และเงื่อนไขการเข้าพักพร้อมสัตว์เลี้ยงในปัจจุบันด้วย ขอบคุณ"
    },
    "enq.group.msg": {
      en: "Hello Patravana team.\nI would like to ask about a group event at the resort.\nDates: {dates}\nOccasion: {purpose}\nLayout: {layout}\nAttendees: {people}\nRooms needed: {rooms}{question}\nCould you send availability and a quote?",
      th: "สวัสดีทีมงานภัทราวานา\nขอสอบถามเรื่องการจัดงานแบบหมู่คณะที่รีสอร์ท\nวันที่: {dates}\nประเภทงาน: {purpose}\nรูปแบบการจัดห้อง: {layout}\nจำนวนผู้เข้าร่วม: {people}\nจำนวนห้องพักที่ต้องการ: {rooms}{question}\nรบกวนแจ้งวันว่างและใบเสนอราคาด้วย ขอบคุณ"
    },
    "enq.pet.subject": { en: "Pet-friendly stay enquiry", th: "สอบถามการเข้าพักพร้อมสัตว์เลี้ยง" },
    "enq.group.subject": { en: "Group event enquiry", th: "สอบถามการจัดงานแบบหมู่คณะ" }
  }
};
