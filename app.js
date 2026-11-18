const FACTORY_ADDRESS = "0xc565844AA6AD6f89F57cc6447F879c85F32fbEc0"; 

// ABI ของ Factory
const FACTORY_ABI = [
    "function createCampaign(string _title, uint256 _target, uint256 _durationDays, string[] _milestoneDetails, uint256[] _milestoneFunds) public",
    "function getDeployedCampaigns() public view returns (address[])"
];

// ABI ของ โครงการ (ตัวลูก)
const CAMPAIGN_ABI = [
    "function projectOwner() view returns (address)",
    "function campaignTitle() view returns (string)",
    "function targetAmount() view returns (uint256)",
    "function currentRaisedAmount() view returns (uint256)",
    "function campaignStatus() view returns (uint8)",
    "function backerBalances(address) view returns (uint256)",
    "function projectMilestones(uint256) view returns (string, uint256, string, bool, bool, bool, uint256)",
    "function backProject() payable",
    "function checkFundingGoal()",
    "function requestMilestoneFund(uint256, string)",
    "function voteApproveMilestone(uint256)",
    "function claimMilestoneFund(uint256)",
    "function refundBacker()"
];

let provider, signer, userAddress;
let factoryContract;
let currentCampaignContract; // เก็บข้อมูล Contract โครงการที่กำลังเลือกอยู่

const statusMap = ["กำลังระดมทุน", "ดำเนินงาน", "ระดมทุนล้มเหลว", "เสร็จสิ้น"];

// 1. เชื่อมต่อกระเป๋า
async function connectWallet() {
    if (window.ethereum) {
        try {
            provider = new ethers.BrowserProvider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            signer = await provider.getSigner();
            userAddress = await signer.getAddress();
            
            document.getElementById('connectBtn').innerText = userAddress.substring(0, 6) + "..." + userAddress.slice(-4);
            document.getElementById('connectBtn').classList.replace('btn-primary', 'btn-success');

            // สร้างการเชื่อมต่อกับ Factory
            factoryContract = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
            
            // โหลดรายชื่อโครงการทันทีที่เชื่อมต่อเสร็จ
            loadCampaignsList();
        } catch (error) {
            console.error(error);
            alert("การเชื่อมต่อล้มเหลว");
        }
    } else {
        alert("กรุณาติดตั้ง MetaMask Extension");
    }
}

// 2. สร้างโครงการใหม่ผ่าน Factory
async function createNewCampaign() {
    if (!factoryContract) return alert("กรุณาเชื่อมต่อกระเป๋าก่อน");

    const title = document.getElementById('newTitle').value;
    const targetEth = document.getElementById('newTarget').value;
    const duration = document.getElementById('newDuration').value;
    const mNames = document.getElementById('newMilestoneNames').value.split(',').map(s => s.trim());
    const mAmountsEth = document.getElementById('newMilestoneAmounts').value.split(',').map(s => s.trim());

    if(!title || !targetEth || !duration || mNames.length === 0) return alert("กรุณากรอกข้อมูลให้ครบถ้วน");
    if(mNames.length !== mAmountsEth.length) return alert("จำนวนชื่องานและยอดเงินแต่ละเฟสต้องเท่ากัน");

    try {
        const targetWei = ethers.parseEther(targetEth);
        const mAmountsWei = mAmountsEth.map(amt => ethers.parseEther(amt));

        const tx = await factoryContract.createCampaign(title, targetWei, duration, mNames, mAmountsWei);
        alert("กำลังทำรายการ สร้างโครงการ กรุณารอสักครู่...");
        await tx.wait();
        
        alert("สร้างโครงการใหม่สำเร็จ!");
        loadCampaignsList(); // โหลดรายชื่อใหม่
    } catch (error) {
        alert("Error: " + (error.reason || error.message));
    }
}

// 3. โหลดรายชื่อโครงการทั้งหมดมาแสดงใน Dropdown
async function loadCampaignsList() {
    if (!factoryContract) return;
    try {
        const campaigns = await factoryContract.getDeployedCampaigns();
        const selector = document.getElementById('campaignSelector');
        
        // ล้างข้อมูลเก่า
        selector.innerHTML = '<option value="">-- กรุณาเลือกโครงการ --</option>';
        
        campaigns.forEach((address, index) => {
            const opt = document.createElement('option');
            opt.value = address;
            opt.innerText = `โครงการที่ ${index + 1} (${address.substring(0,6)}...${address.slice(-4)})`;
            selector.appendChild(opt);
        });
    } catch (error) {
        console.error("โหลดรายชื่อโครงการไม่สำเร็จ", error);
    }
}

// 4. เมื่อผู้ใช้เลือกโครงการจาก Dropdown
function selectCampaign() {
    const selectedAddress = document.getElementById('campaignSelector').value;
    if (!selectedAddress) {
        document.getElementById('campaignDashboard').style.display = 'none';
        return;
    }
    
    // แสดงแดชบอร์ดและเชื่อมต่อ Contract ตัวลูก
    document.getElementById('campaignDashboard').style.display = 'block';
    currentCampaignContract = new ethers.Contract(selectedAddress, CAMPAIGN_ABI, signer);
    
    // โหลดข้อมูลของโครงการที่เลือกมาแสดง
    loadCampaignData();
}

// 5. โหลดข้อมูลของโครงการตัวลูกมาแสดงบน UI
async function loadCampaignData() {
    if (!currentCampaignContract) return;
    
    try {
        document.getElementById('campaignTitle').innerText = await currentCampaignContract.campaignTitle();
        document.getElementById('ownerAddress').innerText = await currentCampaignContract.projectOwner();
        
        const targetWei = await currentCampaignContract.targetAmount();
        document.getElementById('targetAmount').innerText = ethers.formatEther(targetWei);
        
        const currentWei = await currentCampaignContract.currentRaisedAmount();
        document.getElementById('currentRaised').innerText = ethers.formatEther(currentWei);
        
        const status = await currentCampaignContract.campaignStatus();
        document.getElementById('campaignStatus').innerText = statusMap[status];

        const myBalanceWei = await currentCampaignContract.backerBalances(userAddress);
        document.getElementById('myBalance').innerText = ethers.formatEther(myBalanceWei);

        // ดึงข้อมูล Milestone
        const container = document.getElementById('milestonesContainer');
        container.innerHTML = ""; 
        
        let i = 0;
        while (true) {
            try {
                const ms = await currentCampaignContract.projectMilestones(i);
                const msAmount = ethers.formatEther(ms[1]);
                
                let html = `
                    <div class="milestone-item">
                        <div class="milestone-header">
                            <span>งานที่ ${i + 1}: ${ms[0]}</span>
                            <span>${msAmount} ETH</span>
                        </div>
                        <div class="milestone-status">
                            <p>ขอเบิกเงิน: ${ms[3] ? "✅ ขอแล้ว" : "❌ ยังไม่ขอ"}</p>
                            <p>อนุมัติ: ${ms[4] ? "✅ ผ่านโหวต" : "❌ ยังไม่ผ่าน"}</p>
                            <p>จ่ายเงิน: ${ms[5] ? "✅ จ่ายแล้ว" : "❌ ยังไม่จ่าย"}</p>
                            <p>ลิงก์งาน: ${ms[2] !== "" ? `<a href="${ms[2]}" target="_blank">ดูหลักฐาน</a>` : "-"}</p>
                        </div>
                        <div class="milestone-actions">
                            <button class="btn-primary" onclick="requestFund(${i})">1. ขอเบิก</button>
                            <button class="btn-warning" onclick="voteApprove(${i})">2. โหวต</button>
                            <button class="btn-success" onclick="claimFund(${i})">3. รับเงิน</button>
                        </div>
                    </div>
                `;
                container.innerHTML += html;
                i++;
            } catch (error) {
                break; // สิ้นสุด Loop เมื่ออ่าน Milestone หมดแล้ว
            }
        }
    } catch (error) {
        console.error("Error loading campaign data", error);
    }
}

// ----------------- ฟังก์ชันจัดการโครงการ (เหมือนเดิม) -----------------
async function backProject() {
    const amount = document.getElementById('contributeAmount').value;
    if (!amount) return alert("กรุณาใส่จำนวน ETH");
    try {
        const tx = await currentCampaignContract.backProject({ value: ethers.parseEther(amount) });
        await tx.wait();
        alert("สนับสนุนเงินทุนสำเร็จ!");
        loadCampaignData();
    } catch (error) { alert("Error: " + (error.reason || error.message)); }
}

async function checkFundingGoal() {
    try {
        const tx = await currentCampaignContract.checkFundingGoal();
        await tx.wait();
        alert("อัปเดตสถานะโครงการเรียบร้อย");
        loadCampaignData();
    } catch (error) { alert("Error: " + (error.reason || error.message)); }
}

async function requestFund(index) {
    const url = prompt("กรุณาใส่ URL หลักฐานการส่งงาน:");
    if (url) {
        try {
            const tx = await currentCampaignContract.requestMilestoneFund(index, url);
            await tx.wait();
            alert("ยื่นขอเบิกเงินสำเร็จ!");
            loadCampaignData();
        } catch (error) { alert("Error: " + (error.reason || error.message)); }
    }
}

async function voteApprove(index) {
    try {
        const tx = await currentCampaignContract.voteApproveMilestone(index);
        await tx.wait();
        alert("โหวตอนุมัติสำเร็จ!");
        loadCampaignData();
    } catch (error) { alert("Error: " + (error.reason || error.message)); }
}

async function claimFund(index) {
    try {
        const tx = await currentCampaignContract.claimMilestoneFund(index);
        await tx.wait();
        alert("โอนเงินสำเร็จ!");
        loadCampaignData();
    } catch (error) { alert("Error: " + (error.reason || error.message)); }
}

async function refundBacker() {
    try {
        const tx = await currentCampaignContract.refundBacker();
        await tx.wait();
        alert("ขอเงินคืนสำเร็จ!");
        loadCampaignData();
    } catch (error) { alert("Error: " + (error.reason || error.message)); }
}