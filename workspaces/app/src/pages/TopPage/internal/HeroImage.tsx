import styled from 'styled-components';

const _Wrapper = styled.div`
  aspect-ratio: 16 / 9;
  width: 100%;
`;

const _Image = styled.img`
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

export const HeroImage: React.FC = () => {
  return (
    <_Wrapper>
      <_Image alt="Cyber TOON" src="/assets/hero.png" />
    </_Wrapper>
  );
};
