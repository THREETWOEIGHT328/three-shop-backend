const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');

const app = express();

// 1. ตั้งค่า Middleware หลัก (ต้องอยู่บนสุดเสมอเพื่อให้อ่านข้อมูลหน้าบ้านได้)
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ตั้งค่ารับไฟล์รูปภาพสลิปแบบเก็บเข้าหน่วยความจำชั่วคราว
const upload = multer({ storage: multer.memoryStorage() });

// 🔹 ฐานข้อมูลจำลองบน Server กลาง (ผูกข้อมูลเริ่มต้นตรงตามหน้าเว็บพี่)
let users = [
    { username: "sittichai328", password: "1", balance: 0, history: [] } 
];

let keys = {
    opt1: ["FJQD-DT5W-HLVQ-SQT7", "LLU8-3EHC-1JNU-CRI4"], 
    opt2: ["6MG1-KRZC-Z4T1-YAW8", "DB4V-B8K2-LKZV-7T9Y", "YX3K-ELQ9-6CLZ-6GYO"], 
    opt3: ["KOU0-DYVV-WKZS-M093"] 
};

const packageNames = { opt1: "PRO FREEFIRE - 1 วัน", opt2: "PRO FREEFIRE - 7 วัน", opt3: "PRO FREEFIRE - ถาวร" };
const packagePrices = { opt1: 10, opt2: 50, opt3: 199 };


// ==========================================
// 🛠️ ADMIN API - ระบบควบคุมหลังบ้าน (จัดตำแหน่งให้อยู่ด้านบนสุดป้องกัน Route เอ๋อ)
// ==========================================

// 1. ดึงรายชื่อผู้ใช้ทั้งหมดไปแสดงในตารางแอดมิน
app.get('/api/admin/users', (req, res) => {
    try {
        return res.json(users); 
    } catch (error) {
        return res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงรายชื่อผู้ใช้" });
    }
});

// 2. ดึงคีย์ทั้งหมดในสต็อกไปโชว์ในหน้าจัดการคีย์
app.get('/api/admin/keys', (req, res) => {
    try {
        return res.json(keys);
    } catch (error) {
        return res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูลคีย์" });
    }
});

// 3. แก้ไข/ปรับยอดเงินลูกค้าจากหน้าเว็บแอดมิน
app.post('/api/admin/update-balance', (req, res) => {
    const { username, newBalance } = req.body;
    const user = users.find(u => u.username === username);
    if (user) {
        user.balance = Number(newBalance);
        return res.json({ success: true, message: "อัปเดตเงินเรียบร้อยแล้ว" });
    } else {
        return res.status(404).json({ success: false, message: "ไม่พบชื่อผู้ใช้งานนี้ในระบบ" });
    }
});

// 4. เพิ่มคีย์เข้าสต็อก
app.post('/api/admin/add-key', (req, res) => {
    const { optionKey, keyText } = req.body;
    if (keys[optionKey]) {
        keys[optionKey].push(keyText);
        return res.json({ success: true, message: "เพิ่มคีย์สำเร็จ" });
    } else {
        return res.status(400).json({ success: false, message: "ไม่พบประเภทคีย์ที่ระบุ" });
    }
});

// 5. ลบคีย์ออกจากสต็อก
app.post('/api/admin/delete-key', (req, res) => {
    const { optionKey, index } = req.body;
    if (keys[optionKey] && keys[optionKey][index] !== undefined) {
        keys[optionKey].splice(index, 1);
        return res.json({ success: true, message: "ลบคีย์สำเร็จ" });
    } else {
        return res.status(400).json({ success: false, message: "ไม่สามารถลบคีย์ได้" });
    }
});


// ==========================================
// 🌐 SYSTEM API - ระบบหน้าบ้านหลัก สำหรับลูกค้า
// ==========================================

// เช็กจำนวนสต็อกสินค้าหน้าแรก
app.get('/api/stock', (req, res) => {
    return res.json({
        opt1: keys.opt1.length,
        opt2: keys.opt2.length,
        opt3: keys.opt3.length
    });
});

// ดึงข้อมูลโปรไฟล์ผู้ใช้งานและประวัติการซื้อ
app.get('/api/user/:username', (req, res) => {
    const user = users.find(u => u.username === req.params.username);
    if (!user) return res.status(404).json({ message: "ไม่พบผู้ใช้งาน" });
    return res.json({
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
    return res.json({ message: "🎉 สมัครสมาชิกสำเร็จเรียบร้อยครับ!" });
});

// เข้าสู่ระบบ
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    return res.json({ message: "เข้าสู่ระบบสำเร็จ", username: user.username });
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
    const delivKey = keys[optionKey].shift(); 
    
    if (!user.history) user.history = [];
    user.history.push({
        name: packageNames[optionKey],
        key: delivKey,
        price: price
    });
    
    return res.json({ success: true, key: delivKey });
});


// ==========================================
// 🏦 TOPUP API - ระบบเช็กสลิปออโต้ (SlipOK V2 ป้องกันการขัดข้อง)
// ==========================================
app.post('/api/verify-slip', upload.single('slip'), async (req, res) => {
    const { username } = req.body;
    const user = users.find(u => u.username === username);

    if (!user) return res.status(404).json({ success: false, message: "ไม่พบชื่อผู้ใช้งานในระบบ" });
    if (!req.file) return res.status(400).json({ success: false, message: "ไม่พบไฟล์รูปภาพสลิปที่ส่งมา" });

    const SLIPOK_API_KEY = process.env.SLIPOK_KEY;

    if (!SLIPOK_API_KEY) {
        console.error("⚠️ ระบบตรวจไม่พบรหัส SLIPOK_KEY บนสภาพแวดล้อม Render");
        return res.status(500).json({ success: false, message: "ระบบตรวจสลิปยังไม่ได้ตั้งค่าคีย์ความปลอดภัยจากแอดมินหลังบ้าน" });
    }

    try {
        const form = new FormData();
        const fileBlob = new Blob([req.file.buffer], { type: req.file.mimetype });
        form.append('files', fileBlob, req.file.originalname);

        const response = await axios.post('https://api.slipok.com/api/v2/detect/upload', form, {
            headers: {
                'x-log-api-key': SLIPOK_API_KEY,
                'Content-Type': 'multipart/form-data'
            }
        });

        if (response.data && response.data.success) {
            const amount = response.data.data.amount; 
            user.balance += amount; 
            return res.json({ success: true, amount: amount });
        } else {
            return res.status(400).json({ success: false, message: response.data.message || "สลิปไม่ถูกต้อง หรือถูกใช้ไปแล้ว" });
        }
    } catch (error) {
        console.error("SlipOK Error Detail:", error.response ? error.response.data : error.message);
        return res.status(500).json({ success: false, message: "เซิร์ฟเวอร์สแกนสลิปขัดข้อง ตรวจสอบเครดิตบนเว็บ SlipOK" });
    }
});

// หน้าแรกป้องกัน Error หน้าเว็บเปล่า
app.get('/', (req, res) => {
    res.send('🚀 THREE SHOP BACKEND IS ONLINE AND READY!');
});


// 🚨 เริ่มต้นรันพอร์ตเซิร์ฟเวอร์
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
