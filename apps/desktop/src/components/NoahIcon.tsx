import noahIcon from "../assets/noah-icon.png";

interface NoahIconProps {
  className?: string;
  alt?: string;
}

export function NoahIcon({
  className = "w-8 h-8 rounded-lg",
  alt = "Noah icon",
}: NoahIconProps) {
  return <img src={noahIcon} alt={alt} className={className} />;
}
