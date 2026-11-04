// Brainbox: Anmeldeseiten mit Markenleiste – links auf dem Rechner, oben auf dem Handy.
import * as React from "react";
import styled from "styled-components";
import { s } from "@shared/styles";
import Fade from "~/components/Fade";
import { draggableOnDesktop } from "~/styles";

/** Ab dieser Breite steht die Markenleiste neben dem Formular (px) */
const SIDE_BY_SIDE_FROM = 820;

type Props = {
  children?: React.ReactNode;
};

export function Background({ children }: Props) {
  return (
    <Shell>
      <Brand aria-hidden>
        <Mark src="/images/icon-192.png" alt="" width={44} height={44} />
        <Name>Brainbox</Name>
        <Tagline>Dein Wiki fürs Homelab</Tagline>
        <Points>
          <li>Jede VM und jeder Container mit eigener Seite</li>
          <li>Geräte und Domains aus NetBird</li>
          <li>Sortiert nach deinen Bereichen</li>
          <li>Claude schreibt mit</li>
        </Points>
        <Foot>Nur für eingeladene Personen</Foot>
      </Brand>
      <Main>{children}</Main>
    </Shell>
  );
}

const Shell = styled(Fade)`
  width: 100vw;
  height: 100%;
  background: ${s("background")};
  display: grid;
  grid-template-columns: minmax(300px, 38%) minmax(0, 1fr);
  ${draggableOnDesktop()}

  @media (max-width: ${SIDE_BY_SIDE_FROM}px) {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }
`;

const Brand = styled.aside`
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 48px 44px;
  color: #e2ebe5;
  background:
    linear-gradient(rgba(76, 213, 150, 0.06) 1px, transparent 1px) 0 0 / 28px 28px,
    linear-gradient(90deg, rgba(76, 213, 150, 0.06) 1px, transparent 1px) 0 0 / 28px 28px,
    radial-gradient(120% 80% at 0% 0%, #12402b 0%, #0b1410 60%);
  border-inline-end: 1px solid rgba(76, 213, 150, 0.14);

  @media (max-width: ${SIDE_BY_SIDE_FROM}px) {
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 12px;
    padding: 16px max(16px, env(safe-area-inset-left, 0px));
    border-inline-end: 0;
    border-bottom: 1px solid rgba(76, 213, 150, 0.14);
  }
`;

const Mark = styled.img`
  width: 44px;
  height: 44px;
  border-radius: 11px;
  margin-bottom: 18px;

  @media (max-width: ${SIDE_BY_SIDE_FROM}px) {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    margin: 0;
  }
`;

const Name = styled.div`
  font-size: 34px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.1;

  @media (max-width: ${SIDE_BY_SIDE_FROM}px) {
    font-size: 20px;
  }
`;

const Tagline = styled.div`
  font-family: ${s("fontFamilyMono")};
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #4cd596;

  @media (max-width: ${SIDE_BY_SIDE_FROM}px) {
    flex-basis: 100%;
    font-size: 11px;
  }
`;

const Points = styled.ul`
  list-style: none;
  margin: 28px 0 0;
  padding: 0;
  display: grid;
  gap: 12px;
  font-size: 15px;
  color: #b9cbc1;

  li {
    display: flex;
    gap: 10px;
    align-items: baseline;
  }

  li::before {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #4cd596;
    flex: none;
    transform: translateY(-1px);
  }

  @media (max-width: ${SIDE_BY_SIDE_FROM}px) {
    display: none;
  }
`;

const Foot = styled.div`
  margin-top: auto;
  font-size: 13px;
  color: #6f8679;

  @media (max-width: ${SIDE_BY_SIDE_FROM}px) {
    display: none;
  }
`;

const Main = styled.main`
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
`;
