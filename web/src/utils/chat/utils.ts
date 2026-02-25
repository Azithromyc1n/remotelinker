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

export const waitBufferedLow = (dc: RTCDataChannel) =>
  new Promise<void>((resolve) => {
    const onLow = () => {
      if (dc.bufferedAmount <= dc.bufferedAmountLowThreshold) {
        dc.removeEventListener("bufferedamountlow", onLow);
        resolve();
      }
    };
    dc.addEventListener("bufferedamountlow", onLow);
    onLow();
  });

export const checkConnectionType = async (pc: RTCPeerConnection, userID: string) => {
    try {
        const stats = await pc.getStats();
        let activePair: any = null;

        // 1. 遍历所有的统计报告，找到当前被选中（nominated）且成功连接的候选对
        stats.forEach(report => {
            if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) {
                activePair = report;
            }
        });

        if (activePair) {
            // 2. 根据 ID 找到对应的 Local 和 Remote 候选者信息
            const local = stats.get(activePair.localCandidateId);
            const remote = stats.get(activePair.remoteCandidateId);

            if (local && remote) {
                console.log(`\n========= 用户 ${userID} 链路检测 =========`);
                console.log(`本地节点: ${local.candidateType} (${local.protocol} ${local.ip || local.address}:${local.port})`);
                console.log(`远端节点: ${remote.candidateType} (${remote.protocol} ${remote.ip || remote.address}:${remote.port})`);

                // 3. 给出链路质量结论
                if (local.candidateType === 'relay' || remote.candidateType === 'relay') {
                    console.warn("当前是 TURN 中继服务器");
                } else if (local.candidateType === 'host' && remote.candidateType === 'host') {
                    console.log("当前是局域网直连 (Host)");
                } else {
                    console.log("当前是外网 P2P 直连 (Srflx/Prflx)");
                }
                console.log(`================================================\n`);
            }
        }
    } catch (e) {
        console.error("获取链路状态失败", e);
    }
};