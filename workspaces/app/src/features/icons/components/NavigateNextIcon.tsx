type Props = {
  color: string;
  height: number;
  width: number;
};

export const NavigateNextIcon: React.FC<Props> = ({ color, height, width }) => (
  <svg style={{ color, height, width }} viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
  </svg>
);
