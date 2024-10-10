import { useState } from "react";

const useModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<React.ReactNode | null>(null);

  const openModal = (modalContent: React.ReactNode) => {
    setContent(modalContent);
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    setContent(null);
  };

  return { isOpen, content, openModal, closeModal };
};

export default useModal;
