export default async function handler(req, res) {
    // Разрешаем CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const data = req.body;
        
        console.log('Platega webhook received:', data);

        // Проверяем статус оплаты
        if (data.status === 'SUCCESS' || data.status === 'COMPLETED') {
            // Платёж успешен
            // order_id содержит: type_userId_timestamp
            const orderId = data.order_id || data.orderId;
            
            return res.status(200).json({ 
                success: true, 
                message: 'Payment processed',
                orderId: orderId
            });
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Payment error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
