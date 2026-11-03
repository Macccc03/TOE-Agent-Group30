import { Icon } from "@phoenix/components/core/icon/Icon";
import { Icons } from "@phoenix/components/core/icon/index";

export const FieldDangerIcon = () => {
  return (
    <Icon color="danger" className="field__icon" svg={<Icons.CloseCircle />} />
  );
};
