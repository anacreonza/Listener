<?xml version="1.0" encoding="UTF-8"?>

<xsl:stylesheet version="1.0"
xmlns:xsl="http://www.w3.org/1999/XSL/Transform">

<xsl:template match="//Article">
<html>
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title><xsl:value-of select="//Heading"/></title>
        <link rel="stylesheet" href="http://02cpt-fwslab01.m24.media24.com/xml/ArticlePreview.css"/>
    </head>
    <body>
        <div class="container">
            <h3 class="IssueDate"><xsl:value-of select="//IssueDate"/></h3>
            <h1 class="MainHead"><xsl:value-of select="//Heading"/></h1>
            <h4 class="Byline"><xsl:value-of select="//Byline"/></h4>
            <a>
                <xsl:attribute name="href">
                    <xsl:value-of select="//ArticleHeader/Image/@href"/>
                </xsl:attribute>
                <img class="MainImage">
                    <xsl:attribute name="src">
                        <xsl:value-of select="//ArticleHeader/Image/@href" />
                    </xsl:attribute>
                </img>
            </a>
            <p class="blurb"><xsl:value-of select="//Blurb"/></p>
            <div class="InfoBlock">
                <ul>
                <xsl:for-each select="//InfoBlock">
                    <li class="InfoBlockEntry"><xsl:value-of select="text()"/></li>
                </xsl:for-each>
                </ul>
            </div>
            <div class="Story">
                <xsl:for-each select="//ArticleBody/Story">
                    <xsl:for-each select="child::*">
                        <xsl:choose>
                            <xsl:when test="name() = 'Story'">
                                <p><xsl:value-of select="text()" /></p>
                            </xsl:when>
                            <xsl:when test="name() = 'HeadingLarge'">
                                <h4><xsl:value-of select="text()" /></h4>
                            </xsl:when>
                        </xsl:choose>
                    </xsl:for-each>
                </xsl:for-each>
            </div>
            <div class="Images">
                <xsl:for-each select="//ArticleBody/Image">
                    <a>
                        <xsl:attribute name="href">
                            <xsl:value-of select="@href"/>
                        </xsl:attribute>
                        <img class="BodyImage">
                            <xsl:attribute name="src">
                                <xsl:value-of select="@href" />
                            </xsl:attribute>
                        </img>
                    </a>
                </xsl:for-each>
            </div>
        </div>
    </body>
</html>
</xsl:template>
</xsl:stylesheet>