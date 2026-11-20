// Dữ liệu thêm của block9 (plan mục 3.3, 16 g): nhóm đầu bếp của hai tài khoản Editor, và 6 món nháp (mỗi nhóm 3 món).
// Món nháp nằm ở file riêng và được ghi SAU 1.200 món gốc, không đi qua bộ sinh trong generate.js: 1.200 món giữ nguyên
// id và nội dung, nên thực đơn công khai (chỉ món published) cho đúng kết quả như block7 (slide 67).

// Nhóm đầu bếp theo vị trí trong danh sách 60 đầu bếp (= id sau RESTART IDENTITY): Editor A nửa đầu, Editor B nửa sau.
export const GROUP_A = [0, 30]; // đầu bếp #1–30
export const GROUP_B = [30, 60]; // đầu bếp #31–60

// Đầu bếp của món nháp: phải trong nhóm của Editor và có chuyên môn trùng tag của món (seed kiểm tra chuyên môn).
const CHEF_A = "Nguyễn Văn An"; // #1, Món nước, Miền Bắc
const B_GRILL = "Huỳnh Hữu Long"; // #47, Món nướng
const B_RICE = "Dương Gia Thảo"; // #45, Món cơm
const B_ROLL = "Đỗ Thu Trang"; // #55, Món cuốn

export const DRAFT_DISHES = [
  { name: "Bún ốc chuối đậu", chef: CHEF_A, tags: ["Món nước", "Miền Bắc"], price: 58000, description: "Món mới đang thử công thức: nước dùng ốc, chuối xanh, đậu rán.", ingredients: ["Bún tươi", "Ốc bươu", "Rau thơm", "Hành lá"] },
  { name: "Canh bún cua đồng rau rút", chef: CHEF_A, tags: ["Món nước", "Miền Bắc"], price: 52000, description: "Món mới đang thử công thức: riêu cua đồng ăn cùng rau.", ingredients: ["Bún tươi", "Cua đồng", "Rau muống", "Hành lá"] },
  { name: "Miến vịt măng khô", chef: CHEF_A, tags: ["Món nước"], price: 62000, description: "Món mới đang thử công thức: nước dùng vịt, măng khô.", ingredients: ["Thịt vịt", "Hành lá", "Rau thơm"] },
  { name: "Sườn non nướng mật ong sả", chef: B_GRILL, tags: ["Món nướng"], price: 89000, description: "Món mới đang thử công thức: ướp mật ong, nướng than.", ingredients: ["Sườn non", "Tỏi", "Sả"] },
  { name: "Cơm đùi gà xối mỡ tỏi", chef: B_RICE, tags: ["Món cơm"], price: 65000, description: "Món mới đang thử công thức: gà giòn, cơm thơm.", ingredients: ["Gạo thơm", "Đùi gà", "Tỏi"] },
  { name: "Gỏi cuốn tôm thẻ sốt bơ", chef: B_ROLL, tags: ["Món cuốn"], price: 55000, description: "Món mới đang thử công thức: cuốn tôm, chấm sốt quả bơ.", ingredients: ["Bánh tráng", "Tôm thẻ", "Rau thơm", "Bún tươi"] },
];
