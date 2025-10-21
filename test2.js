// ตัวอย่าง: คุณได้รับข้อความจาก LINE
const message = "Hello, I want to buy product CODE123456789";

// โจทย์: ให้เขียนฟังก์ชันดึงรหัสผลิตภัณฑ์ (CODEตามด้วยตัวเลข 5 ตัว) ออกจากข้อความ
function getCode(message){
    const regex = /CODE\d{5}/;
    const match = message.match(regex);

    return match ? match[0] : null;
}

const product = getCode(message);
console.log(product);

// Test Cases
const testCases = [
    "Hello, I want to buy product CODE12345",  // ✅ ควรได้ "CODE12345"
    "I need CODE54321 immediately",            // ✅ ควรได้ "CODE54321"  
    "CODE99999 is what I'm looking for",       // ✅ ควรได้ "CODE99999"
    "I want to buy something",                 // ❌ ควรได้ null
    "I need product CODE123",                  // ❌ ควรได้ null (ไม่ครบ 5 ตัว)
    "My code is CODE12ABC",                    // ❌ ควรได้ null (มีตัวอักษร)
    "I want CODE12345 and CODE67890",          // ✅ ควรได้ "CODE12345" (ตัวแรก)
];

testCases.forEach((message, index) => {
    const result = getCode(message);
    console.log(`Test ${index + 1}: ${result}`);
});