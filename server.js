const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

// 💾 ฐานข้อมูลจำลองบน Server (ถ้า Server รีสตาร์ทข้อมูลจะรีเซ็ต แนะนำให้ไปผูกฐานข้อมูลจริงในอนาคต)
let usersData = {};
let keyDatabase = {
    opt1: ["FJQD-DT5W-HLVQ-SQT7", "6MG1-KRZC-Z4T1-YAW8"],
    opt2: ["DB4V-B8K2-LKZV-7T9Y"],
    opt3: ["KOUO-DYVV-WZKS-MO93"]
};

const SLIPOK_API_KEY = "SLIPOKPQPZ45"; // API Key ของพี่
const productPrices = { opt1: 10, opt2: 50, opt3: 199 };
const productNames = { opt1: "PRO FREEFIRE - 1 วัน", opt2: "PRO FREEFIRE - 7 วัน", opt3: "PRO FREEFIRE - ถาวร" };

// 📌 API 1: ดึงจำนวนสต็อกคีย์ทั้งหมด (ส่งไปแสดงที่หน้าบ้านเหมือนกันทุกคน)
app.get('/api/stock', (req, res) => {
    res.json({
        opt1: keyDatabase.opt1.length,
        opt2: keyDatabase.opt2.length,
        opt3: keyDatabase.opt3.length
    });
});

// 📌 API 2: สมัครสมาชิกใหม่ (บันทึกข้อมูลเข้าฐานข้อมูลกลาง)
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (usersData[username]) return res.status(400).json({ message: 'ชื่อผู้ใช้นี้ถูกใช้ไปแล้วในระบบ' });
    
    usersData[username] = { password, balance: 0, history: [] };
    res.json({ success: true, message: 'สมัครสมาชิกสำเร็จ' });
});

// 📌 API 3: เข้าสู่ระบบ
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (usersData[username] && usersData[username].password === password) {
        res.json({ success: true, balance: usersData[username].balance });
    } else {
        res.status(400).json({ message: 'ไอดีหรือรหัสผ่านไม่ถูกต้อง' });
    }
});

// 📌 API 4: ดึงประวัติการซื้อและยอดเงินล่าสุด
app.get('/api/user/:username', (req, res) => {
    const user = usersData[req.params.username];
    if (!user) return res.status(404).json({ message: 'ไม่พบผู้ใช้งาน' });
    res.json({ balance: user.balance, history: user.history });
});

// 📌 API 5: ระบบสั่งซื้อสินค้า (ตัดเงินจากฐานข้อมูลส่วนกลาง)
app.post('/api/buy', (req, res) => {
    const { username, optionKey } = req.body;
    const user = usersData[username];
    
    if (!user) return res.status(404).json({ message: 'กรุณาเข้าสู่ระบบก่อน' });
    if (keyDatabase[optionKey].length === 0) return res.status(400).json({ message: 'สินค้าหมดสต็อก' });
    
    const price = productPrices[optionKey];
    if (user.balance < price) return res.status(400).json({ message: 'เงินในระบบของท่านไม่เพียงพอ' });

    user.balance -= price;
    const releasedKey = keyDatabase[optionKey].shift();
    
    const purchaseItem = { name: productNames[optionKey], key: releasedKey, price: price };
    user.history.push(purchaseItem);

    res.json({ success: true, key: releasedKey, balance: user.balance });
});

// 📌 API 6: ตรวจสอบสลิปโอนเงินผ่านเซิร์ฟเวอร์โดยตรง (แก้ปัญหาเรื่องรหัสไม่เด้งและแก้ CORS ทันที)
const multer = require('multer');
const upload = multer();
const FormData = require('form-data');

app.post('/api/verify-slip', upload.single('slip'), async (req, res) => {
    const { username } = req.body;
    if (!usersData[username]) return res.status(400).json({ message: 'ไม่พบชื่อผู้ใช้งานนี้ในระบบหลังบ้าน' });

    try {
        const form = new FormData();
        form.append('files', req.file.buffer, { filename: req.file.originalname });

        const response = await axios.post('https://api.slipok.com/api/v1/verify', form, {
            headers: {
                ...form.getHeaders(),
                'x-api-key': SLIPOK_API_KEY
            }
        });

        if (response.data && (response.data.success || response.data.status === "success")) {
            const amount = response.data.data.amount;
            usersData[username].balance += Number(amount); // เพิ่มเงินเข้าบัญชีกลาง
            return res.json({ success: true, amount: amount, balance: usersData[username].balance });
        }
        res.status(400).json({ message: response.data.message || 'สลิปไม่ถูกต้อง' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ SlipOK' });
    }
});

// 📌 API 7: หน้าสำหรับพี่ (แอดมิน) เข้ามานั่งเช็กข้อมูลดูว่าตอนนี้ใครมีเงินเท่าไหร่ (รหัสเด้งมาที่นี่)
app.get('/api/admin/dashboard', (req, res) => {
    res.json({ total_users: Object.keys(usersData).length, users: usersData, current_stock: keyDatabase });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));