import { Icon } from "@phoenix/components/core/icon/Icon";
import { Icons } from "@phoenix/components/core/icon/index";

export const FieldSuccessIcon = () => {
  return (
    <Icon color="success" className="field__icon" svg={<Icons.Checkmark />} />
  );
};
