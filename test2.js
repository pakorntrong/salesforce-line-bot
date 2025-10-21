const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.json());

app.post('/hello', (req, res) => {
  const { name } = req.body;
  res.json({ message: `Hello ${name}` }); // ใช้ backtick
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at port ${PORT}`); // ใช้ backtick
});
