const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// ตั้งค่ารับไฟล์รูปภาพสลิป (เก็บไว้ใน Memory ชั่วคราวเพื่อส่งต่อให้ SlipOK)
const upload = multer({ storage: multer.memoryStorage() });

// 🔹 ฐานข้อมูลจำลองบน Server กลาง (เมื่อรีสตาร์ทข้อมูลจะรีเซ็ต หากต้องการเก็บถาวรในอนาคตค่อยต่อ Database ครับ)
let users = [
    { username: "sittichai328", password: "1", balance: 0 } // บัญชีแอดมิน/ทดสอบตั้งต้น
];

let keys = {
    opt1: ["FJQD-DT5W-HLVQ-SQT7", "LLU8-3EHC-1JNU-CRI4"], // สต็อกคีย์ 1 วัน
    opt2: ["6MG1-KRZC-Z4T1-YAW8", "DB4V-B8K2-LKZV-7T9Y", "YX3K-ELQ9-6CLZ-6GYO"], // สต็อกคีย์ 7 วัน
    opt3: ["KOU0-DYVV-WKZS-M093"] // สต็อกคีย์ถาวร
};

const packageNames = { opt1: "PRO FREEFIRE - 1 วัน", opt2: "PRO FREEFIRE - 7 วัน", opt3: "PRO FREEFIRE - ถาวร" };
const packagePrices = { opt1: 10, opt2: 50, opt3: 199 };

// ==========================================
// 🌐 SYSTEM API - ระบบหน้าบ้านหลัก สำหรับลูกค้า
// ==========================================

// เช็กจำนวนสต็อกสินค้าหน้าแรก
app.get('/api/stock', (req, res) => {
    res.json({
        opt1: keys.opt1.length,
        opt2: keys.opt2.length,
        opt3: keys.opt3.length
    });
});

// ดึงข้อมูลโปรไฟล์ผู้ใช้งานและประวัติการซื้อ
app.get('/api/user/:username', (req, res) => {
    const user = users.find(u => u.username === req.params.username);
    if (!user) return res.status(404).json({ message: "ไม่พบผู้ใช้งาน" });
    res.json({
        username: user.username,
        balance: user.balance,
        history: user.history || []
    });
});

// สมัครสมาชิกใหม่
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "กรอกข้อมูลไม่ครบ" });
    
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ message: "❌ ชื่อผู้ใช้งานนี้มีคนใช้แล้วครับพี่" });
    }
    
    users.push({ username, password, balance: 0, history: [] });
    res.json({ message: "🎉 สมัครสมาชิกสำเร็จเรียบร้อยครับ!" });
});

// เข้าสู่ระบบ
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    res.json({ message: "เข้าสู่ระบบสำเร็จ", username: user.username });
});

// ซื้อสินค้าและตัดคีย์ออกจากสต็อก
app.post('/api/buy', (req, res) => {
    const { username, optionKey } = req.body;
    const user = users.find(u => u.username === username);
    
    if (!user) return res.status(404).json({ message: "ไม่พบชื่อผู้ใช้งาน" });
    if (!keys[optionKey] || keys[optionKey].length === 0) return res.status(400).json({ message: "❌ สินค้าชิ้นนี้หมดสต็อกแล้วครับพี่" });
    
    const price = packagePrices[optionKey];
    if (user.balance < price) return res.status(400).json({ message: "❌ ยอดเงินคงเหลือของพี่ไม่พอครับ กรุณาเติมเงินก่อน" });
    
    // หักเงินและตัดคีย์ส่งให้ลูกค้า
    user.balance -= price;
    const delivKey = keys[optionKey].shift(); // ดึงคีย์แรกสุดออกจากสต็อก
    
    if (!user.history) user.history = [];
    user.history.push({
        name: packageNames[optionKey],
        key: delivKey,
        price: price
    });
    
    res.json({ success: true, key: delivKey });
});

// ==========================================
// 🏦 TOPUP API - ระบบเช็กสลิปออโต้ (SlipOK V2 เสถียรที่สุด)
// ==========================================
app.post('/api/verify-slip', upload.single('slip'), async (req, res) => {
    const { username } = req.body;
    const user = users.find(u => u.username === username);

    if (!user) return res.status(404).json({ success: false, message: "ไม่พบชื่อผู้ใช้งานในระบบ" });
    if (!req.file) return res.status(400).json({ success: false, message: "ไม่พบไฟล์รูปภาพสลิปที่ส่งมา" });

    const SLIPOK_API_KEY = process.env.SLIPOK_KEY; 

    if (!SLIPOK_API_KEY) {
        console.error("⚠️ แอดมินยังไม่ได้ตั้งค่า SLIPOK_KEY บน Render Environment ครับ");
        return res.status(500).json({ success: false, message: "ระบบตรวจสลิปยังไม่ได้ตั้งค่าคีย์ความปลอดภัยจากเจ้าของร้าน" });
    }

    try {
        // สร้าง FormData และแนบไฟล์แบบ Buffer + ระบุรายละเอียดไฟล์ให้ถูกต้อง ป้องกันโครงสร้างพัง
        const formData = new FormData();
        const fileBuffer = req.file.buffer;
        const fileBlob = new Blob([fileBuffer], { type: req.file.mimetype });
        formData.append('files', fileBlob, req.file.originalname);

        // ยิงเข้า SlipOK API v2 ตัวล่าสุด
        const response = await axios.post('https://api.slipok.com/api/v2/detect/upload', formData, {
            headers: {
                'x-log-api-key': SLIPOK_API_KEY,
                'Content-Type': 'multipart/form-data'
            }
        });

        if (response.data && response.data.success) {
            // ดึงจำนวนเงินจริงจากสลิปโอนเงิน
            const amount = response.data.data.amount; 
            user.balance += amount; // บวกเงินให้ลูกค้าในระบบทันที
            return res.json({ success: true, amount: amount });
        } else {
            return res.status(400).json({ success: false, message: response.data.message || "สลิปไม่ถูกต้อง หรือถูกใช้ไปแล้ว" });
        }
    } catch (error) {
        console.error("SlipOK Error Detail:", error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, message: "เซิร์ฟเวอร์สแกนสลิปขัดข้อง ตรวจสอบเงินคงเหลือในเว็บ SlipOK หรือ Key บน Render" });
    }
});


// ==========================================
// 🛠️ ADMIN API - ระบบควบคุมหลังบ้าน (สำหรับหน้า admin.html)
// ==========================================

// 1. เส้นทางดึงรายชื่อลูกค้าทั้งหมดไปแสดงในตารางแอดมิน
app.get('/api/admin/users', (req, res) => {
    try {
        res.json(users); 
    } catch (error) {
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงรายชื่อผู้ใช้" });
    }
});

// 2. เส้นทางดึงคีย์รอขายทั้งหมดในระบบไปโชว์ในหน้าจัดการคีย์
app.get('/api/admin/keys', (req, res) => {
    try {
        res.json(keys);
    } catch (error) {
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูลคีย์" });
    }
});

// 3. เส้นทางแก้ไขและปรับเงินในบัญชีลูกค้าจากหน้าเว็บแอดมิน
app.post('/api/admin/update-balance', (req, res) => {
    const { username, newBalance } = req.body;
    const user = users.find(u => u.username === username);
    if (user) {
        user.balance = Number(newBalance);
        res.json({ success: true, message: "อัปเดตเงินเรียบร้อยแล้ว" });
    } else {
        res.status(404).json({ success: false, message: "ไม่พบชื่อผู้ใช้งานนี้ในระบบ" });
    }
});

// 4. เส้นทางแอดมินพิมพ์เพิ่มคีย์ใหม่เข้าระบบสต็อก
app.post('/api/admin/add-key', (req, res) => {
    const { optionKey, keyText } = req.body;
    if (keys[optionKey]) {
        keys[optionKey].push(keyText);
        res.json({ success: true, message: "เพิ่มคีย์สำเร็จ" });
    } else {
        res.status(400).json({ success: false, message: "ไม่พบประเภทคีย์ที่ระบุ" });
    }
});

// 5. เส้นทางแอดมินกดคลิกลบคีย์รายตัวออกจากระบบสต็อก
app.post('/api/admin/delete-key', (req, res) => {
    const { optionKey, index } = req.body;
    if (keys[optionKey] && keys[optionKey][index] !== undefined) {
        keys[optionKey].splice(index, 1);
        res.json({ success: true, message: "ลบคีย์สำเร็จ" });
    } else {
        res.status(400).json({ success: false, message: "ไม่สามารถลบคีย์ได้" });
    }
});


// 🚨 เริ่มต้นรันพอร์ตเซิร์ฟเวอร์
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
