// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20; // แนะนำให้ใช้เวอร์ชัน 0.8.20 ขึ้นไป

contract InnovateFundCampaignV2 {
    address public projectOwner;
    string public campaignTitle;
    uint256 public targetAmount;
    uint256 public fundingDeadline;
    uint256 public currentRaisedAmount;

    enum FundingState { Gathering, InProgress, Unsuccessful, Finished }
    FundingState public campaignStatus;

    struct ProjectMilestone {
        string taskDetails;
        uint256 fundAmount;
        string evidenceUrl;       
        bool fundRequested;       
        bool votePassed;          
        bool fundClaimed;         
        uint256 totalVoteWeight;  
    }

    ProjectMilestone[] public projectMilestones;
    mapping(address => uint256) public backerBalances;
    mapping(uint256 => mapping(address => bool)) public milestoneVoted;

    event FundBacked(address indexed backer, uint256 amount);
    event MilestoneFundRequested(uint256 index, string evidenceUrl);
    event MilestoneVoted(address indexed voter, uint256 milestoneIndex);
    event MilestoneFundReleased(uint256 milestoneIndex, uint256 amount);
    event BackerRefunded(address indexed backer, uint256 amount);
    event FundingStatusUpdated(FundingState newStatus);

    modifier onlyProjectOwner() {
        require(msg.sender == projectOwner, "Only project owner can call this function");
        _;
    }

    /**
     * @dev แก้ไข Constructor ให้รับ _owner เข้ามาด้วย เพื่อให้ Factory กำหนดเจ้าของได้
     */
    constructor(
        string memory _title,
        uint256 _target,
        uint256 _durationDays,
        string[] memory _milestoneDetails,
        uint256[] memory _milestoneFunds,
        address _owner // <--- เพิ่มตัวแปรนี้
    ) {
        require(_milestoneDetails.length == _milestoneFunds.length, "Milestone arrays must match");
        
        // กำหนดเจ้าของโครงการเป็น _owner ที่ส่งมาจาก Factory
        projectOwner = _owner; 
        
        campaignTitle = _title;
        targetAmount = _target;
        fundingDeadline = block.timestamp + (_durationDays * 1 minutes); // ใช้ minutes เพื่อการทดสอบ
        campaignStatus = FundingState.Gathering;

        uint256 totalMilestoneFunds = 0;
        for (uint i = 0; i < _milestoneDetails.length; i++) {
            projectMilestones.push(ProjectMilestone({
                taskDetails: _milestoneDetails[i],
                fundAmount: _milestoneFunds[i],
                evidenceUrl: "",
                fundRequested: false,
                votePassed: false,
                fundClaimed: false,
                totalVoteWeight: 0
            }));
            totalMilestoneFunds += _milestoneFunds[i];
        }
        require(totalMilestoneFunds == _target, "Total milestones amount must equal target amount");
    }

    function backProject() public payable {
        require(campaignStatus == FundingState.Gathering, "Campaign is not in gathering state");
        require(block.timestamp < fundingDeadline, "Funding period has ended");
        require(msg.value > 0, "Contribution must be greater than 0");

        backerBalances[msg.sender] += msg.value;
        currentRaisedAmount += msg.value;

        emit FundBacked(msg.sender, msg.value);
    }

    function checkFundingGoal() public {
        require(campaignStatus == FundingState.Gathering, "Campaign already checked");
        require(block.timestamp >= fundingDeadline, "Funding not yet ended");

        if (currentRaisedAmount >= targetAmount) {
            campaignStatus = FundingState.InProgress; 
        } else {
            campaignStatus = FundingState.Unsuccessful; 
        }
        emit FundingStatusUpdated(campaignStatus);
    }

    function getCampaignProgress() public view returns (uint256 current, uint256 target, uint256 timeRemaining) {
        current = currentRaisedAmount;
        target = targetAmount;
        if (block.timestamp >= fundingDeadline) {
            timeRemaining = 0;
        } else {
            timeRemaining = fundingDeadline - block.timestamp;
        }
    }

    function requestMilestoneFund(uint256 _milestoneIndex, string memory _evidenceUrl) public onlyProjectOwner {
        require(campaignStatus == FundingState.InProgress, "Campaign is not in progress");
        require(_milestoneIndex < projectMilestones.length, "Invalid milestone index");
        
        ProjectMilestone storage ms = projectMilestones[_milestoneIndex];
        require(!ms.fundRequested, "Milestone already requested");
        require(!ms.fundClaimed, "Milestone already claimed");

        ms.fundRequested = true;
        ms.evidenceUrl = _evidenceUrl;

        emit MilestoneFundRequested(_milestoneIndex, _evidenceUrl);
    }

    function voteApproveMilestone(uint256 _milestoneIndex) public {
        require(campaignStatus == FundingState.InProgress, "Campaign is not in progress");
        require(backerBalances[msg.sender] > 0, "Only backers can vote");
        require(_milestoneIndex < projectMilestones.length, "Invalid milestone index");

        ProjectMilestone storage ms = projectMilestones[_milestoneIndex];
        require(ms.fundRequested, "Milestone not yet requested by owner");
        require(!ms.fundClaimed, "Milestone already claimed");
        require(!milestoneVoted[_milestoneIndex][msg.sender], "You have already voted for this milestone");

        milestoneVoted[_milestoneIndex][msg.sender] = true;
        ms.totalVoteWeight += backerBalances[msg.sender];

        if (ms.totalVoteWeight > currentRaisedAmount / 2) {
            ms.votePassed = true;
        }

        emit MilestoneVoted(msg.sender, _milestoneIndex);
    }

    function claimMilestoneFund(uint256 _milestoneIndex) public onlyProjectOwner {
        require(campaignStatus == FundingState.InProgress, "Campaign is not in progress");
        ProjectMilestone storage ms = projectMilestones[_milestoneIndex];
        require(ms.votePassed, "Milestone not yet approved by backers");
        require(!ms.fundClaimed, "Milestone already claimed");

        ms.fundClaimed = true;
        
        (bool success, ) = payable(projectOwner).call{value: ms.fundAmount}("");
        require(success, "Fund claim failed");

        emit MilestoneFundReleased(_milestoneIndex, ms.fundAmount);
    }

    function refundBacker() public {
        require(campaignStatus == FundingState.Unsuccessful, "Campaign did not fail");
        uint256 amountToRefund = backerBalances[msg.sender];
        require(amountToRefund > 0, "No contributions to refund");

        backerBalances[msg.sender] = 0;
        
        (bool success, ) = payable(msg.sender).call{value: amountToRefund}("");
        require(success, "Refund failed");

        emit BackerRefunded(msg.sender, amountToRefund);
    }
}

// สร้าง Contract CampaignFactory แยกออกมาด้านล่าง
contract CampaignFactory {
    address[] public deployedCampaigns;

    event CampaignCreated(
        address indexed campaignAddress, 
        address indexed creator, 
        string title
    );

    function createCampaign(
        string memory _title,
        uint256 _target,
        uint256 _durationDays,
        string[] memory _milestoneDetails,
        uint256[] memory _milestoneFunds
    ) public {
        // สร้าง Campaign ใหม่ โดยส่ง msg.sender (คนที่กดสร้าง) ไปเป็น _owner ด้วย
        InnovateFundCampaignV2 newCampaign = new InnovateFundCampaignV2(
            _title,
            _target,
            _durationDays,
            _milestoneDetails,
            _milestoneFunds,
            msg.sender
        );

        deployedCampaigns.push(address(newCampaign));

        emit CampaignCreated(address(newCampaign), msg.sender, _title);
    }

    function getDeployedCampaigns() public view returns (address[] memory) {
        return deployedCampaigns;
    }
}