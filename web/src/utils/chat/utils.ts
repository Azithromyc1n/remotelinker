export const safeUUID = () => {
    // 现代浏览器
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    // 次优：用 crypto.getRandomValues 生成 16 bytes
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        // 简单转 hex
        return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    // 最后兜底：时间戳+随机数（不够强但够用做 key）
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

//时间格式转换
export const formatDateTime = (time : number) => {
    const d = new Date(time);

    const yyyy = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");

    const HH = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");

    return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
}

//生成随机颜色
export const colorFromId = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 70% 55%)`;
};

//基于用户名生成首字符
export const getFirstWord = (username: string) => {
    const s = username.trim();
    return s[0].toUpperCase();
}