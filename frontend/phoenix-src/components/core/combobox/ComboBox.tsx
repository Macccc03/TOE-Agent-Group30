import { css } from "@emotion/react";
import React from "react";
import type {
  ComboBoxProps as AriaComboBoxProps,
  ListBoxItemProps as AriaListBoxItemProps,
  ListBoxProps,
  ValidationResult,
} from "react-aria-components";
import {
  ComboBox as AriaComboBox,
  Button,
  FieldError,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Text,
} from "react-aria-components";

import { Icon } from "@phoenix/components/core/icon/Icon";
import { Icons } from "@phoenix/components/core/icon/index";
import { SelectChevronUpDownIcon } from "@phoenix/components/core/icon/SelectChevronUpDownIcon";
import { Popover } from "@phoenix/components/core/overlay/Popover";
import type { SizingProps } from "@phoenix/components/core/types/sizing";

import { fieldBaseCSS } from "../field/styles";
import { comboBoxCSS, comboBoxItemCSS, comboBoxPopoverCSS } from "./styles";

export interface ComboBoxProps<T extends object>
  extends
    Omit<AriaComboBoxProps<T>, "children">,
    SizingProps,
    Pick<ListBoxProps<T>, "renderEmptyState"> {
  label?: string;
  placeholder?: string;
  description?: string | null;
  errorMessage?: string | ((validation: ValidationResult) => string);
  children: React.ReactNode | ((item: T) => React.ReactNode);
  /**
   * The width of the combobox. If not provided, the combobox will be sized to fit its contents. with a minimum width of 200px.
   * @default "100%"
   */
  width?: string;
  /**
   * If true, click and keypress events will not propagate to the parent element.
   *
   * This is useful when nesting the combobox within containers that have onClick handlers,
   * but should be used sparingly.
   */
  stopPropagation?: boolean;
}

/**
 * Prevents the event from propagating to the parent element.
 */
const stopPropagationHandler = (
  event: React.MouseEvent | React.KeyboardEvent
) => {
  event.stopPropagation();
};

export function ComboBox<T extends object>({
  label,
  placeholder,
  description,
  errorMessage,
  children,
  size = "M",
  width,
  stopPropagation,
  renderEmptyState,
  isInvalid,
  menuTrigger = "focus",
  ...props
}: ComboBoxProps<T>) {
  return (
    <AriaComboBox
      {...props}
      menuTrigger={menuTrigger}
      css={css(fieldBaseCSS, comboBoxCSS)}
      data-size={size}
      isInvalid={isInvalid || Boolean(errorMessage)}
      style={{
        width,
      }}
      allowsEmptyCollection={!!renderEmptyState}
    >
      {label && <Label>{label}</Label>}
      <div
        className="combobox__container"
        // Prevent interactions with the combobox components from propagating above this element
        // This allows us to nest the combobox within containers that have onClick handlers
        onClick={stopPropagation ? stopPropagationHandler : undefined}
        onKeyDown={stopPropagation ? stopPropagationHandler : undefined}
        onKeyUp={stopPropagation ? stopPropagationHandler : undefined}
      >
        <Input placeholder={placeholder} />
        <Button>
          <SelectChevronUpDownIcon />
        </Button>
      </div>
      {description && !errorMessage ? (
        <Text slot="description">{description}</Text>
      ) : null}
      <FieldError>{errorMessage}</FieldError>
      <Popover css={comboBoxPopoverCSS}>
        <ListBox renderEmptyState={renderEmptyState}>{children}</ListBox>
      </Popover>
    </AriaComboBox>
  );
}

export interface ListBoxItemProps<T = object> extends Omit<
  AriaListBoxItemProps<T>,
  "textValue"
> {
  /**
   * A string representation of the item's contents, used for features like typeahead.
   **/
  textValue: string;
}

export function ComboBoxItem(props: ListBoxItemProps) {
  const { children, ...rest } = props;
  return (
    <ListBoxItem {...rest} css={comboBoxItemCSS}>
      {({ isSelected }) => {
        return (
          <>
            {children}
            {isSelected && (
              <Icon
                svg={<Icons.Checkmark />}
                className="menu-item__selected-checkmark"
              />
            )}
          </>
        );
      }}
    </ListBoxItem>
  );
}
